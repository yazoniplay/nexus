-- Nexus Studio Bridge MVP. See docs/roblox-studio-bridge.md.
local HttpService = game:GetService("HttpService")
local ENDPOINT = "https://kuvyaytptnghopqbykab.supabase.co/functions/v1/nexus-ai"
local TOKEN_SETTING = "NexusStudioSessionToken"
local savedToken = plugin:GetSetting(TOKEN_SETTING)
local connected = type(savedToken) == "string" and #savedToken == 64
local currentTaskId = nil

local toolbar = plugin:CreateToolbar("Nexus")
local openButton = toolbar:CreateButton("Nexus Bridge", "Open the Nexus task bridge", "")
local widgetInfo = DockWidgetPluginGuiInfo.new(Enum.InitialDockState.Right, false, false, 380, 500, 320, 320)
local widget = plugin:CreateDockWidgetPluginGui("NexusStudioBridge", widgetInfo)
widget.Title = "Nexus Studio Bridge"

local root = Instance.new("Frame")
root.Size = UDim2.fromScale(1, 1)
root.BackgroundColor3 = Color3.fromRGB(18, 20, 25)
root.BorderSizePixel = 0
root.Parent = widget
local pad = Instance.new("UIPadding")
pad.PaddingTop = UDim.new(0, 14); pad.PaddingBottom = UDim.new(0, 14)
pad.PaddingLeft = UDim.new(0, 14); pad.PaddingRight = UDim.new(0, 14); pad.Parent = root
local layout = Instance.new("UIListLayout")
layout.Padding = UDim.new(0, 9); layout.SortOrder = Enum.SortOrder.LayoutOrder; layout.Parent = root

local function label(text, height, order)
    local l = Instance.new("TextLabel")
    l.LayoutOrder = order; l.Size = UDim2.new(1, 0, 0, height)
    l.BackgroundTransparency = 1; l.TextColor3 = Color3.fromRGB(235, 239, 245)
    l.Font = Enum.Font.Gotham; l.TextSize = 13; l.TextWrapped = true
    l.TextXAlignment = Enum.TextXAlignment.Left; l.TextYAlignment = Enum.TextYAlignment.Center
    l.Text = text; l.Parent = root
    return l
end
local heading = label("NEXUS  /  ROBLOX STUDIO", 28, 1)
heading.Font = Enum.Font.GothamBold; heading.TextSize = 16
local status = label(connected and "Saved token found. Checking Nexus…" or "Create a pairing code on the Nexus website.", 42, 2)
status.TextColor3 = Color3.fromRGB(170, 183, 201)

local codeBox = Instance.new("TextBox")
codeBox.LayoutOrder = 3; codeBox.Size = UDim2.new(1, 0, 0, 38)
codeBox.BackgroundColor3 = Color3.fromRGB(31, 35, 43); codeBox.TextColor3 = Color3.new(1, 1, 1)
codeBox.PlaceholderText = "8-digit pairing code"; codeBox.PlaceholderColor3 = Color3.fromRGB(130, 140, 155)
codeBox.ClearTextOnFocus = false; codeBox.Font = Enum.Font.Gotham; codeBox.TextSize = 14; codeBox.Parent = root

local function button(text, order, bg, fg)
    local b = Instance.new("TextButton")
    b.LayoutOrder = order; b.Size = UDim2.new(1, 0, 0, 36)
    b.BackgroundColor3 = bg or Color3.fromRGB(226, 232, 240)
    b.TextColor3 = fg or Color3.fromRGB(18, 20, 25)
    b.Font = Enum.Font.GothamBold; b.TextSize = 13; b.Text = text; b.Parent = root
    return b
end
local pairButton = button("Pair with Nexus", 4)
local disconnectButton = button("Disconnect this Studio", 5, Color3.fromRGB(55, 39, 42), Color3.fromRGB(255, 220, 220))
local taskLabel = label("No task received yet. Send a task from the Nexus website.", 110, 6)
taskLabel.TextColor3 = Color3.fromRGB(190, 201, 218)
taskLabel.TextYAlignment = Enum.TextYAlignment.Top
local completeButton = button("Acknowledge task", 7)
completeButton.Active = false; completeButton.AutoButtonColor = false
completeButton.BackgroundColor3 = Color3.fromRGB(45, 49, 58); completeButton.TextColor3 = Color3.fromRGB(130, 140, 155)
label("MVP safety: tasks are displayed for human review. No generated code is executed or applied automatically.", 58, 8)
local busy = false

local function request(payload)
    local response = HttpService:RequestAsync({
        Url = ENDPOINT, Method = "POST",
        Headers = { ["Content-Type"] = "application/json" },
        Body = HttpService:JSONEncode(payload),
    })
    local data = {}
    pcall(function() data = HttpService:JSONDecode(response.Body) end)
    if not response.Success then error(data.error or ("Nexus returned HTTP " .. tostring(response.StatusCode))) end
    return data
end
local function setStatus(text, isError)
    status.Text = text
    status.TextColor3 = isError and Color3.fromRGB(255, 130, 130) or Color3.fromRGB(170, 220, 185)
end
local function updateTask(text, id)
    currentTaskId = id
    taskLabel.Text = text
    completeButton.Active = id ~= nil
    completeButton.AutoButtonColor = id ~= nil
    completeButton.BackgroundColor3 = id and Color3.fromRGB(226, 232, 240) or Color3.fromRGB(45, 49, 58)
    completeButton.TextColor3 = id and Color3.fromRGB(18, 20, 25) or Color3.fromRGB(130, 140, 155)
end

pairButton.Activated:Connect(function()
    if busy then return end
    local code = codeBox.Text:gsub("%s+", "")
    if not code:match("^%d%d%d%d%d%d%d%d$") then setStatus("Enter the 8-digit code shown in Nexus.", true); return end
    busy = true; pairButton.Text = "Pairing…"
    local ok, result = pcall(function() return request({action = "studio_pair_claim", pair_code = code}) end)
    if ok and result.session_token then
        savedToken = result.session_token; plugin:SetSetting(TOKEN_SETTING, savedToken); connected = true
        codeBox.Text = ""; setStatus("Paired. Waiting for tasks from Nexus.", false)
    else
        setStatus(ok and (result.error or "Pairing failed.") or tostring(result), true)
    end
    pairButton.Text = "Pair with Nexus"; busy = false
end)

disconnectButton.Activated:Connect(function()
    if connected and savedToken then pcall(function() request({action = "studio_revoke", session_token = savedToken}) end) end
    plugin:SetSetting(TOKEN_SETTING, nil); savedToken = nil; connected = false
    currentTaskId = nil; updateTask("Disconnected. Pair again from the Nexus website when needed.", nil)
    setStatus("Disconnected from Nexus.", false)
end)

completeButton.Activated:Connect(function()
    if busy or not connected or not currentTaskId then return end
    busy = true
    local id = currentTaskId
    local ok, result = pcall(function()
        return request({action = "studio_task_result", session_token = savedToken, task_id = id, status = "completed",
            result = "Task acknowledged in Studio. No code changes were applied automatically; human review is still required."})
    end)
    if ok and result.ok then
        updateTask("Task acknowledged. Send another task from Nexus.", nil)
        setStatus("Task result sent to Nexus.", false)
    else
        setStatus(ok and (result.error or "Could not send task result.") or tostring(result), true)
    end
    busy = false
end)

openButton.Click:Connect(function() widget.Enabled = not widget.Enabled end)
local function poll()
    if not connected or not savedToken or busy or currentTaskId then return end
    local ok, result = pcall(function() return request({action = "studio_task_poll", session_token = savedToken}) end)
    if not ok then setStatus("Bridge request failed: " .. tostring(result), true); return end
    if result.task then
        updateTask("TASK FROM NEXUS\n\n" .. tostring(result.task.task or ""), result.task.id)
        setStatus("Task received. Review it before acknowledging.", false)
    else
        setStatus("Connected · waiting for Nexus tasks", false)
    end
end
task.spawn(function()
    while true do
        if widget.Enabled then poll() end
        task.wait(15)
    end
end)
