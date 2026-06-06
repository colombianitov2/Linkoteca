$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$WritableRoot = if ($env:LINKOTECA_HOME) {
  [System.IO.Path]::GetFullPath($env:LINKOTECA_HOME)
} else {
  [string]$ProjectRoot
}
$ExcelPath = "C:\Users\erpec\Desktop\Links.xlsx"
$DataDir = Join-Path $WritableRoot "data"
$OutputPath = Join-Path $DataDir "linkoteca.json"

function Assert-InProject {
  param([string]$PathToCheck)

  $root = [System.IO.Path]::GetFullPath($WritableRoot).TrimEnd('\').ToLowerInvariant()
  $target = [System.IO.Path]::GetFullPath($PathToCheck).ToLowerInvariant()
  if (-not ($target -eq $root -or $target.StartsWith($root + "\"))) {
    throw "Ruta de escritura no permitida: $PathToCheck"
  }
}

function ConvertTo-Slug {
  param([string]$Value)

  if ($null -eq $Value) { $Value = "" }
  $normalized = $Value.Normalize([System.Text.NormalizationForm]::FormD)
  $builder = New-Object System.Text.StringBuilder
  foreach ($char in $normalized.ToCharArray()) {
    $category = [System.Globalization.CharUnicodeInfo]::GetUnicodeCategory($char)
    if ($category -ne [System.Globalization.UnicodeCategory]::NonSpacingMark) {
      [void]$builder.Append($char)
    }
  }
  $slug = $builder.ToString().ToLowerInvariant() -replace '[^\w\s-]', '' -replace '\s+', '-' -replace '-+', '-'
  $slug = $slug.Trim('-')
  if ([string]::IsNullOrWhiteSpace($slug)) { return "sin-nombre" }
  if ($slug.Length -gt 80) { return $slug.Substring(0, 80) }
  return $slug
}

function Get-IdFrom {
  param([string[]]$Parts)

  $text = [string]::Join("|", $Parts)
  $sha1 = [System.Security.Cryptography.SHA1]::Create()
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($text)
  $hashBytes = $sha1.ComputeHash($bytes)
  $hash = -join ($hashBytes | ForEach-Object { $_.ToString("x2") })
  return $hash.Substring(0, 16)
}

function Get-Platform {
  param([string]$Url)

  try {
    $uri = [System.Uri]$Url
    $hostName = $uri.Host.ToLowerInvariant() -replace '^www\.', ''
    if ($hostName -like '*youtube.com*' -or $hostName -like '*youtu.be*') { return "YouTube" }
    if ($hostName -like '*instagram.com*') { return "Instagram" }
    if ($hostName -like '*facebook.com*' -or $hostName -like '*fb.watch*') { return "Facebook" }
    if ($hostName -like '*tiktok.com*') { return "TikTok" }
    if ($hostName -like '*vimeo.com*') { return "Vimeo" }
    return ($hostName -split '\.')[0]
  } catch {
    return "Web"
  }
}

function Get-YouTubeId {
  param([string]$Url)

  try {
    $uri = [System.Uri]$Url
    if ($uri.Host -like '*youtu.be*') {
      return $uri.AbsolutePath.Trim('/').Split('/')[0]
    }
    if ($uri.Host -like '*youtube.com*') {
      $query = [System.Web.HttpUtility]::ParseQueryString($uri.Query)
      $videoId = $query.Get("v")
      if ($videoId) { return $videoId }
      $parts = $uri.AbsolutePath.Trim('/').Split('/')
      if ($parts.Length -gt 0) { return $parts[-1] }
    }
  } catch {
    return ""
  }
  return ""
}

function Get-Thumbnail {
  param([string]$Url)

  $youtubeId = Get-YouTubeId $Url
  if ($youtubeId) { return "https://img.youtube.com/vi/$youtubeId/hqdefault.jpg" }
  return ""
}

function Get-CellText {
  param(
    [xml]$SheetXml,
    [string]$Ref,
    [System.Xml.XmlNamespaceManager]$Namespace,
    [object[]]$SharedStrings
  )

  $cell = $SheetXml.SelectSingleNode("//x:c[@r='$Ref']", $Namespace)
  if ($null -eq $cell) { return "" }
  $type = $cell.GetAttribute("t")
  if ($type -eq "s") {
    $idx = [int]$cell.v
    if ($idx -ge 0 -and $idx -lt $SharedStrings.Count) { return [string]$SharedStrings[$idx] }
    return ""
  }
  if ($type -eq "inlineStr") {
    $nodes = $cell.SelectNodes(".//x:t", $Namespace)
    return (($nodes | ForEach-Object { $_.InnerText }) -join "")
  }
  if ($cell.v) { return [string]$cell.v }
  return ""
}

function Read-Utf8Xml {
  param([string]$Path)

  return [xml][System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
}

function Get-OrAddCategory {
  param(
    [object[]]$Categories,
    [hashtable]$CategoryMap,
    [string]$Name,
    [string]$Now,
    [string]$Source = "excel"
  )

  if ($null -eq $Name) { $Name = "Sin clasificar" }
  $cleanName = $Name.Trim()
  if ([string]::IsNullOrWhiteSpace($cleanName)) { $cleanName = "Sin clasificar" }
  $key = $cleanName.ToLowerInvariant()
  if ($CategoryMap.ContainsKey($key)) { return $CategoryMap[$key] }

  $category = [ordered]@{
    id = Get-IdFrom @("category", $cleanName)
    name = $cleanName
    slug = ConvertTo-Slug $cleanName
    parentId = $null
    createdAt = $Now
    updatedAt = $Now
    source = $Source
  }
  $CategoryMap[$key] = $category
  $script:CategoryList.Add($category) | Out-Null
  return $category
}

if (-not (Test-Path -LiteralPath $ExcelPath)) {
  throw "No se encontro el Excel: $ExcelPath"
}

Assert-InProject $OutputPath
New-Item -ItemType Directory -Path $DataDir -Force | Out-Null

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("linkoteca_xlsx_" + [System.Guid]::NewGuid().ToString("N"))
$zipPath = Join-Path $tempRoot "links.zip"
New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null

try {
  Copy-Item -LiteralPath $ExcelPath -Destination $zipPath -Force
  Expand-Archive -LiteralPath $zipPath -DestinationPath $tempRoot -Force

  $nameTable = New-Object System.Xml.NameTable
  $ns = New-Object System.Xml.XmlNamespaceManager($nameTable)
  $ns.AddNamespace("x", "http://schemas.openxmlformats.org/spreadsheetml/2006/main")
  $ns.AddNamespace("r", "http://schemas.openxmlformats.org/officeDocument/2006/relationships")

  [xml]$workbookXml = Read-Utf8Xml (Join-Path $tempRoot "xl\workbook.xml")
  [xml]$workbookRelsXml = Read-Utf8Xml (Join-Path $tempRoot "xl\_rels\workbook.xml.rels")
  $workbookRelMap = @{}
  foreach ($rel in $workbookRelsXml.Relationships.Relationship) {
    $workbookRelMap[$rel.Id] = [string]$rel.Target
  }

  $sharedStrings = @()
  $sstPath = Join-Path $tempRoot "xl\sharedStrings.xml"
  if (Test-Path -LiteralPath $sstPath) {
    [xml]$sstXml = Read-Utf8Xml $sstPath
    foreach ($si in $sstXml.sst.si) {
      $textNodes = $si.SelectNodes(".//x:t", $ns)
      $sharedStrings += (($textNodes | ForEach-Object { $_.InnerText }) -join "")
    }
  }

  $now = (Get-Date).ToUniversalTime().ToString("o")
  $script:CategoryList = New-Object System.Collections.ArrayList
  $categoryMap = @{}
  $links = New-Object System.Collections.ArrayList

  foreach ($sheet in $workbookXml.workbook.sheets.sheet) {
    $sheetName = [string]$sheet.name
    $relationshipId = $sheet.GetAttribute("id", "http://schemas.openxmlformats.org/officeDocument/2006/relationships")
    if (-not $workbookRelMap.ContainsKey($relationshipId)) { continue }

    $target = $workbookRelMap[$relationshipId].Replace("/", "\")
    $sheetPath = Join-Path (Join-Path $tempRoot "xl") $target
    if (-not (Test-Path -LiteralPath $sheetPath)) { continue }

    [xml]$sheetXml = Read-Utf8Xml $sheetPath
    $category = Get-OrAddCategory $script:CategoryList $categoryMap $sheetName $now "excel"

    $sheetRelMap = @{}
    $relPath = Join-Path (Split-Path $sheetPath -Parent) ("_rels\" + (Split-Path $sheetPath -Leaf) + ".rels")
    if (Test-Path -LiteralPath $relPath) {
      [xml]$sheetRelsXml = Read-Utf8Xml $relPath
      foreach ($rel in $sheetRelsXml.Relationships.Relationship) {
        $sheetRelMap[$rel.Id] = [string]$rel.Target
      }
    }

    foreach ($hyperlink in $sheetXml.worksheet.hyperlinks.hyperlink) {
      $cellRef = [string]$hyperlink.ref
      $hrefRid = $hyperlink.GetAttribute("id", "http://schemas.openxmlformats.org/officeDocument/2006/relationships")
      $url = ""
      if ($hrefRid -and $sheetRelMap.ContainsKey($hrefRid)) {
        $url = [System.Net.WebUtility]::HtmlDecode($sheetRelMap[$hrefRid])
      }
      if ($url -notmatch '^https?://') { continue }

      $title = (Get-CellText $sheetXml $cellRef $ns $sharedStrings).Trim()
      if ([string]::IsNullOrWhiteSpace($title)) { $title = "Enlace sin titulo" }

      $links.Add([ordered]@{
        id = Get-IdFrom @($url, $sheetName, $cellRef)
        title = $title
        url = $url
        description = ""
        thumbnail = Get-Thumbnail $url
        platform = Get-Platform $url
        categoryId = $category.id
        status = "confirmado"
        archived = $false
        archivedAt = ""
        tags = @()
        confidence = 1
        source = "excel"
        sourceSheet = $sheetName
        sourceCell = $cellRef
        createdAt = $now
        updatedAt = $now
      }) | Out-Null
    }
  }

  $review = Get-OrAddCategory $script:CategoryList $categoryMap "Por revisar" $now "system"
  $review.source = "system"

  $database = [ordered]@{
    version = 1
    createdAt = $now
    updatedAt = $now
    sourceExcel = $ExcelPath
    categories = @($script:CategoryList)
    links = @($links)
    settings = [ordered]@{
      contact = [ordered]@{
        ownerName = "Ernesto Pernett"
        ownerTitle = "Ingeniero Mecánico"
        supportEmail = "epernett1020@hotmail.com"
        paypalUrl = "https://www.paypal.com/paypalme/Wolframica?locale.x=es_XC&country.x=CO"
      }
      storage = [ordered]@{
        path = (Join-Path $WritableRoot "exports")
        format = "json"
      }
      sync = [ordered]@{
        mode = "none"
        provider = "none"
        autoOnOpen = $true
        remoteUrl = ""
        webdavUrl = ""
        folderPath = ""
        username = ""
        password = ""
      }
      updates = [ordered]@{
        latestVersionUrl = ""
        androidUrl = ""
        iosUrl = ""
        pcUrl = ""
      }
    }
    safety = [ordered]@{
      writableRoot = [string]$WritableRoot
      blockedRoots = @("D:\Nube", "D:\Nube\Fotos y videos")
    }
  }

  $json = $database | ConvertTo-Json -Depth 8
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($OutputPath, $json + [Environment]::NewLine, $utf8NoBom)
  Write-Host "Importados $($links.Count) enlaces en $($script:CategoryList.Count) carpetas."
} finally {
  if (Test-Path -LiteralPath $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force
  }
}
