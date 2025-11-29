
<#
.SYNOPSIS
    Scans a hardcoded web domain for configuration files and assets.

.DESCRIPTION
    This script is designed for rapid reconnaissance of a specific web application.
    The target domain is hardcoded for one-click execution. It scans for common
    configuration files, then parses the homepage to find and search inside JS files
    for configuration-related keywords.

#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter()]
    [int]$TimeoutSec = 15,

    [Parameter()]
    [int]$JsSearchLimit = 10,

    [Parameter()]
    [switch]$Parallel
)

#Requires -Version 7.0
Set-StrictMode -Version Latest

# --- CONFIGURATION ---
# The correct domain, identified from your browser console logs.
$TargetDomain = "www.carecredit.com"
# ---------------------

#region Helper Functions

# (Helper functions are the same as before, no changes needed here)
function Invoke-HttpRequest {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Url,
        [Parameter()]
        [int]$Timeout = 15
    )
    if (-not $PSCmdlet.ShouldProcess($Url, "Web Request")) {
        return [pscustomobject]@{ Success = $false; Status = "SKIPPED"; Url = $Url; Reason = "WhatIf mode enabled." }
    }
    try {
        $params = @{
            Uri                = $Url
            Method             = 'Head'
            MaximumRedirection = 5
            TimeoutSec         = $Timeout
            UserAgent          = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36"
            ErrorAction        = 'Stop'
        }
        $headResponse = Invoke-WebRequest @params
        $isText = $headResponse.Headers['Content-Type'] -match 'text|json|xml|javascript'
        return [pscustomobject]@{ Success = $true; Status = [int]$headResponse.StatusCode; Url = $Url; IsText = $isText; Content = $null; Error = $null }
    }
    catch {
        $statusCode = "ERR"; $errorMessage = $_.Exception.Message
        if ($null -ne $_.Exception.Response) { try { $statusCode = [int]$_.Exception.Response.StatusCode } catch { $statusCode = $_.Exception.Response.StatusCode.ToString() } }
        elseif ($null -ne $_.Exception.Status) { $statusCode = $_.Exception.Status.ToString() }
        return [pscustomobject]@{ Success = $false; Status = $statusCode; Url = $Url; IsText = $false; Content = $null; Error = $errorMessage }
    }
}

function Find-AssetsInHtml {
    [OutputType([pscustomobject])]
    param([Parameter(Mandatory = $true)][string]$HtmlContent, [Parameter(Mandatory = $true)][string]$BaseUrl)
    Write-Information "[*] Parsing homepage for asset links..."
    $assets = @()
    $jsRegex = [regex]"src=[`"\'](?<path>[^`"\']+?\.js)"
    $jsonRegex = [regex]"(?:href|src)=[`"\'](?<path>[^`"\']+?\.json)"
    $allPaths = @($jsRegex.Matches($HtmlContent) | ForEach-Object { $_.Groups['path'].Value }) + @($jsonRegex.Matches($HtmlContent) | ForEach-Object { $_.Groups['path'].Value }) | Sort-Object -Unique
    foreach ($path in $allPaths) {
        $fullUrl = if ($path -match '^https?:') { $path } elseif ($path.StartsWith('/')) { "$BaseUrl$path" } else { "$BaseUrl/$path" }
        $assets += [pscustomobject]@{ Type = if ($path -match '\.js$') { 'JS' } else { 'JSON' }; Url = $fullUrl }
    }
    return $assets
}

function Search-ContentForKeywords {
    param([Parameter(Mandatory = $true)][string]$Content, [Parameter(Mandatory = $true)][string]$SourceUrl)
    $keywords = @("config.json", "asset-manifest", "assetManifest", "manifest", "baseUrl", "cdnUrl", "apiUrl", "window.__CONFIG__", "window.__ENV")
    $foundKeywords = @()
    foreach ($kw in $keywords) { if ($Content -match [regex]::Escape($kw)) { $foundKeywords += $kw } }
    if ($foundKeywords.Count -gt 0) { return [pscustomobject]@{ SourceUrl = $SourceUrl; Keywords = $foundKeywords } }
    return $null
}

#endregion

#region Main Execution

Write-Host "`n--- Starting Web Config Scanner for $TargetDomain ---" -ForegroundColor Cyan
$BaseUrl = "https://$TargetDomain"
$candidates = @("config.json", "manifest.json", "asset-manifest.json", "robots.txt", "sitemap.xml", "assets/config.json", "public/config.json", "public/build/config.json", "public/build/asset-manifest.json", "build/config.json", "static/config.json", "config/settings.json", "api/config", "manifest.webmanifest", ".well-known/manifest.json")
Write-Host "`n[*] Step 1: Scanning common candidate paths..." -ForegroundColor Yellow
$candidateUrls = $candidates | ForEach-Object { "$BaseUrl/$_" }
if ($Parallel.IsPresent) {
    $results = $candidateUrls | ForEach-Object -ThrottleLimit 20 -Parallel { . $using:PSCommandPath; Invoke-HttpRequest -Url $_ -Timeout $using:TimeoutSec }
} else {
    $results = $candidateUrls | ForEach-Object { Invoke-HttpRequest -Url $_ -Timeout $TimeoutSec }
}
$foundConfigs = $results | Where-Object { $_.Success -and $_.Status -eq 200 }
if ($foundConfigs) { Write-Host "`n[+] SUCCESS! Found accessible configuration files:" -ForegroundColor Green; $foundConfigs | ForEach-Object { Write-Host "  -> $($_.Url)" -ForegroundColor Green } }
else { Write-Host "`n[-] No accessible configuration files found in the candidate list." -ForegroundColor DarkRed }

Write-Host "`n[*] Step 2: Fetching homepage ($BaseUrl) to discover more assets..." -ForegroundColor Yellow
try {
    $homePage = Invoke-WebRequest -Uri $BaseUrl -UserAgent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" -TimeoutSec $TimeoutSec -ErrorAction Stop

    # --- NEW DEFENSIVE CHECK ---
    if (-not $homePage.Content -or $homePage.Content.Trim().Length -eq 0) {
        Write-Error "FATAL: Successfully connected to $BaseUrl, but the page content was empty. The site might be blocking automated requests."
        exit 1
    }
    # --- END NEW CHECK ---

    $discoveredAssets = Find-AssetsInHtml -HtmlContent $homePage.Content -BaseUrl $BaseUrl
    $jsAssets = $discoveredAssets | Where-Object { $_.Type -eq 'JS' } | Select-Object -First $JsSearchLimit
    if ($jsAssets) {
        Write-Host "`n[*] Step 3: Searching content of up to $JsSearchLimit discovered JavaScript files for config keywords..." -ForegroundColor Yellow
        $jsUrls = $jsAssets | ForEach-Object { $_.Url }
        if ($Parallel.IsPresent) {
            $jsContents = $jsUrls | ForEach-Object -ThrottleLimit 10 -Parallel {
                $res = Invoke-WebRequest -Uri $_ -UserAgent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" -TimeoutSec $using:TimeoutSec -ErrorAction SilentlyContinue
                if ($res.StatusCode -eq 200 -and $res.Content) { [pscustomobject]@{ Url = $_; Content = $res.Content } }
            }
        } else {
            $jsContents = $jsUrls | ForEach-Object {
                try { $res = Invoke-WebRequest -Uri $_ -UserAgent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" -TimeoutSec $TimeoutSec -ErrorAction Stop; [pscustomobject]@{ Url = $_; Content = $res.Content } }
                catch { Write-Warning "Failed to download $($_.Exception.Message)" }
            }
        }
        $keywordResults = $jsContents | ForEach-Object { Search-ContentForKeywords -Content $_.Content -SourceUrl $_.Url } | Where-Object { $null -ne $_ }
        if ($keywordResults) { Write-Host "`n[+] Found potential configuration keywords in JS files:" -ForegroundColor Green; $keywordResults | ForEach-Object { Write-Host "  -> $($_.SourceUrl)" -ForegroundColor White; $_.Keywords | ForEach-Object { Write-Host "     - Matched keyword: '$_'" -ForegroundColor Cyan } } }
        else { Write-Host "`n[-] No relevant keywords found in the JavaScript files." -ForegroundColor DarkRed }
    } else { Write-Host "[-] No JavaScript files discovered on the homepage to search." -ForegroundColor DarkRed }
} catch { Write-Error "FATAL: Failed to fetch homepage. Error: $($_.Exception.Message)"; exit 1 }
Write-Host "`n--- Scan Complete ---" -ForegroundColor Cyan
#endregion