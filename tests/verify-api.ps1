$ErrorActionPreference = 'Stop'
$base = 'http://localhost:3000'
$null = Invoke-WebRequest -Uri "$base/" -UseBasicParsing -SessionVariable cellSession
$original = Invoke-RestMethod -Uri "$base/api/notebook" -WebSession $cellSession
$fixture = Get-Content -LiteralPath work/fixture.json -Raw | ConvertFrom-Json
try {
  $body = @{ data=$fixture; revision=$original.revision } | ConvertTo-Json -Depth 100
  $saved = Invoke-RestMethod -Uri "$base/api/notebook" -Method Put -ContentType 'application/json' -Body $body -WebSession $cellSession
  $read = Invoke-RestMethod -Uri "$base/api/notebook" -WebSession $cellSession
  if ($read.data.counts.Count -ne 1 -or $read.data.experiments.Count -ne 1) { throw 'Persistence read-back failed' }
  $conflict = Invoke-WebRequest -Uri "$base/api/notebook" -Method Put -ContentType 'application/json' -Body $body -WebSession $cellSession -SkipHttpErrorCheck
  if ($conflict.StatusCode -ne 409) { throw 'Stale revision was not rejected' }
  $bad = @{ data=@{schema=1;projects=@();cultures=@();counts=@(@{id='bad'});experiments=@()}; revision=$saved.revision } | ConvertTo-Json -Depth 100
  $invalid = Invoke-WebRequest -Uri "$base/api/notebook" -Method Put -ContentType 'application/json' -Body $bad -WebSession $cellSession -SkipHttpErrorCheck
  if ($invalid.StatusCode -ne 400) { throw 'Malformed notebook was not rejected' }
  $anon = Invoke-WebRequest -Uri "$base/api/notebook" -SkipHttpErrorCheck
  if ($anon.StatusCode -ne 401) { throw 'Anonymous access was not rejected' }
  $history = Invoke-RestMethod -Uri "$base/api/notebook?revision=$($original.revision)" -WebSession $cellSession
  if ($history.data.projects.Count -ne $original.data.projects.Count) { throw 'History snapshot failed' }
  Write-Output 'PASS: authenticated save and reload, stale-version conflict, invalid payload rejection, anonymous access rejection, previous-version recovery.'
} finally {
  $latest = Invoke-RestMethod -Uri "$base/api/notebook" -WebSession $cellSession
  $restoreBody = @{data=$original.data;revision=$latest.revision} | ConvertTo-Json -Depth 100
  $null = Invoke-RestMethod -Uri "$base/api/notebook" -Method Put -ContentType 'application/json' -Body $restoreBody -WebSession $cellSession
}

