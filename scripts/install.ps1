param(
  [ValidateSet("dev", "prod")]
  [string]$Channel = "prod",
  [string]$Repo = "GGos3/forge"
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw "gh CLI is required. Install it first: https://cli.github.com/"
}

function Get-ForgeReleaseTag {
  param(
    [string]$Repository,
    [string]$ReleaseChannel
  )

  if ($ReleaseChannel -eq "dev") {
    return gh api "repos/$Repository/releases?per_page=50" --jq 'map(select(.prerelease == true and .draft == false)) | sort_by(.published_at // .created_at) | reverse | .[0].tag_name'
  }

  return gh api "repos/$Repository/releases?per_page=50" --jq 'map(select(.prerelease == false and .draft == false)) | sort_by(.published_at // .created_at) | reverse | .[0].tag_name'
}

function Install-Forge {
  param(
    [ValidateSet("dev", "prod")]
    [string]$Channel = "prod",
    [string]$Repo = "GGos3/forge"
  )

  $tag = (Get-ForgeReleaseTag -Repository $Repo -ReleaseChannel $Channel).Trim()
  if ([string]::IsNullOrWhiteSpace($tag) -or $tag -eq "null") {
    throw "No release found for channel: $Channel"
  }

  $tmpDir = Join-Path $env:TEMP ("forge-install-" + [guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null

  try {
    gh release download $tag -R $Repo -D $tmpDir -p "*setup*.exe" 2>$null
    $installer = Get-ChildItem -Path $tmpDir -Filter "*setup*.exe" | Select-Object -First 1

    if (-not $installer) {
      gh release download $tag -R $Repo -D $tmpDir -p "*.msi" 2>$null
      $installer = Get-ChildItem -Path $tmpDir -Filter "*.msi" | Select-Object -First 1
    }

    if (-not $installer) {
      gh release download $tag -R $Repo -D $tmpDir -p "*.exe"
      $installer = Get-ChildItem -Path $tmpDir -Filter "*.exe" | Select-Object -First 1
    }

    if (-not $installer) {
      throw "No Windows installer asset found in release $tag"
    }

    if ($installer.Extension -eq ".msi") {
      Start-Process msiexec.exe -ArgumentList "/i", $installer.FullName, "/quiet", "/norestart" -Wait
      Write-Host "Installed MSI from $($installer.Name)"
      return
    }

    Start-Process -FilePath $installer.FullName -ArgumentList "/S" -Wait
    Write-Host "Installed EXE from $($installer.Name)"
  }
  finally {
    if (Test-Path $tmpDir) {
      Remove-Item $tmpDir -Recurse -Force
    }
  }
}

Install-Forge -Channel $Channel -Repo $Repo
