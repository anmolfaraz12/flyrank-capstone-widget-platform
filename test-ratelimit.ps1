$widgetId = "f496f890-3252-4af5-811c-c530f16a40ac"

for ($i = 1; $i -le 25; $i++) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:4000/widgets/$widgetId/submissions" -Method POST -ContentType "application/json" -Body '{"comment":"burst test"}'
        Write-Host "Request $i -> STATUS:" $response.StatusCode
    } catch {
        Write-Host "Request $i -> STATUS:" $_.Exception.Response.StatusCode.value__
    }
}