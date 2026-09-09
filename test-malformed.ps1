$widgetId = "f496f890-3252-4af5-811c-c530f16a40ac"

try {
    $response = Invoke-WebRequest -Uri "http://localhost:4000/widgets/$widgetId/submissions" -Method POST -ContentType "application/json" -Body '{"comment": {"nested": "object"}}'
    Write-Host "STATUS CODE:" $response.StatusCode
    Write-Host "BODY:" $response.Content
} catch {
    Write-Host "STATUS CODE:" $_.Exception.Response.StatusCode.value__
    Write-Host "BODY:" $_.ErrorDetails.Message
}