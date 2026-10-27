-- Nexus Studio Bridge MVP. See docs/roblox-studio-bridge.md.
local HttpService = game:GetService("HttpService")
local ScriptEditorService = game:GetService("ScriptEditorService")
local ENDPOINT = "https://kuvyaytptnghopqbykab.supabase.co/functions/v1/nexus-ai"
local TOKEN_SETTING = "NexusStudioSessionToken"
local savedToken = plugin:GetSetting(TOKEN_SETTING)
local connected = type(savedToken) == "string" and #savedToken == 64
local currentTaskId = nil
local pendingProposal = nil
local scriptInstances = {}
local originalSources = {}

local toolbar = plugin:CreateToolbar("Nexus")
local openButton = toolbar:CreateButton("Nexus Bridge", "Open the Nexus task bridge", "")
local widgetInfo = DockWidgetPluginGuiInfo.new(Enum.InitialDockState.Right, false, false, 380, 500, 320, 320)
local widget = plugin:CreateDockWidgetPluginGui("NexusStudioBridge", widgetInfo)
widget.Title = "Nexus Studio Bridge"

local root = Instance.new("ScrollingFrame")
root.Size = UDim2.fromScale(1, 1)
root.BackgroundColor3 = Color3.fromRGB(18, 20, 25)
root.BorderSizePixel = 0
root.CanvasSize = UDim2.new(0, 0, 0, 0)
root.AutomaticCanvasSize = Enum.AutomaticSize.Y
root.ScrollingDirection = Enum.ScrollingDirection.Y
root.ScrollBarThickness = 5
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
local taskLabel = label("No task received yet. Send a task from the Nexus website.", 76, 6)
taskLabel.TextColor3 = Color3.fromRGB(190, 201, 218)
taskLabel.TextYAlignment = Enum.TextYAlignment.Top
local applyButton = button("Apply proposed changes", 7)
applyButton.Active = false; applyButton.AutoButtonColor = false
applyButton.BackgroundColor3 = Color3.fromRGB(45, 49, 58); applyButton.TextColor3 = Color3.fromRGB(130, 140, 155)
local rejectButton = button("Reject proposal", 8, Color3.fromRGB(55, 39, 42), Color3.fromRGB(255, 220, 220))
rejectButton.Active = false; rejectButton.AutoButtonColor = false
local previewLabel = label("AI proposal preview will appear here. No code changes are applied until you click Apply.", 150, 9)
previewLabel.TextColor3 = Color3.fromRGB(190, 201, 218)
previewLabel.TextYAlignment = Enum.TextYAlignment.Top
label("Safety: only existing scripts are editable. Review the proposal first; save a copy of your place before applying changes.", 48, 10)
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
    local canApply = id ~= nil and pendingProposal ~= nil and type(pendingProposal.edits) == "table" and #pendingProposal.edits > 0
    applyButton.Active = canApply
    applyButton.AutoButtonColor = canApply
    applyButton.BackgroundColor3 = canApply and Color3.fromRGB(226, 232, 240) or Color3.fromRGB(45, 49, 58)
    applyButton.TextColor3 = canApply and Color3.fromRGB(18, 20, 25) or Color3.fromRGB(130, 140, 155)
    rejectButton.Active = id ~= nil
    rejectButton.AutoButtonColor = id ~= nil
end

local function getScriptPath(scriptInstance)
    local parts = {}
    local node = scriptInstance
    while node and node ~= game do
        local parent = node.Parent
        local ordinal = 1
        if parent then
            for _, sibling in ipairs(parent:GetChildren()) do
                if sibling == node then break end
                if sibling.Name == node.Name and sibling.ClassName == node.ClassName then ordinal += 1 end
            end
        end
        table.insert(parts, 1, node.Name .. "<" .. node.ClassName .. ">#" .. tostring(ordinal))
        node = parent
    end
    return table.concat(parts, "/")
end

local function collectScripts()
    scriptInstances = {}
    originalSources = {}
    local scripts = {}
    local skippedLong = 0
    for _, instance in ipairs(game:GetDescendants()) do
        if instance:IsA("LuaSourceContainer") then
            local ok, source = pcall(function() return ScriptEditorService:GetEditorSource(instance) end)
            if ok and type(source) == "string" and #source > 0 then
                if #source <= 5000 and #scripts < 12 then
                    local path = getScriptPath(instance)
                    scriptInstances[path] = instance
                    originalSources[path] = source
                    table.insert(scripts, {path = path, name = instance.Name, className = instance.ClassName, source = source})
                else
                    skippedLong += 1
                end
            end
        end
    end
    return scripts, skippedLong
end

local function completeTask(statusValue, resultText)
    local id = currentTaskId
    if not id then return false end
    local ok, result = pcall(function()
        return request({action = "studio_task_result", session_token = savedToken, task_id = id, status = statusValue, result = resultText})
    end)
    if ok and result.ok then
        pendingProposal = nil
        updateTask(statusValue == "completed" and "Changes applied and reported to Nexus." or "Proposal rejected; no code was changed.", nil)
        previewLabel.Text = resultText
        setStatus(statusValue == "completed" and "Applied changes reported to Nexus." or "Proposal rejected.", false)
        return true
    end
    setStatus(ok and (result.error or "Could not send task result.") or tostring(result), true)
    return false
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
    currentTaskId = nil; pendingProposal = nil; updateTask("Disconnected. Pair again from the Nexus website when needed.", nil)
    previewLabel.Text = "Disconnected. No proposal is available."
    setStatus("Disconnected from Nexus.", false)
end)

applyButton.Activated:Connect(function()
    if busy or not connected or not currentTaskId or not pendingProposal or #pendingProposal.edits == 0 then return end
    busy = true
    applyButton.Text = "Applying…"
    local applied, skipped, failures = 0, 0, {}
    for _, edit in ipairs(pendingProposal.edits) do
        local target = scriptInstances[edit.path]
        local original = originalSources[edit.path]
        if not target or not original then
            table.insert(failures, edit.path .. " (script no longer exists)")
            skipped += 1
        else
            local readOk, current = pcall(function() return ScriptEditorService:GetEditorSource(target) end)
            if not readOk or current ~= original then
                table.insert(failures, edit.path .. " (changed since proposal; skipped)")
                skipped += 1
            else
                local didApply = false
                local writeOk, writeError = pcall(function()
                    ScriptEditorService:UpdateSourceAsync(target, function(oldSource)
                        if oldSource ~= original then return nil end
                        didApply = true
                        return edit.source
                    end)
                end)
                if writeOk and didApply then
                    applied += 1
                else
                    skipped += 1
                    table.insert(failures, edit.path .. " (" .. tostring(writeError or "source changed; skipped") .. ")")
                end
            end
        end
    end
    if applied > 0 then
        local resultText = "Applied " .. tostring(applied) .. " script change(s). " .. tostring(skipped) .. " skipped. Summary: " .. tostring(pendingProposal.summary or "")
        if #failures > 0 then resultText ..= "\nSkipped: " .. table.concat(failures, "; ") end
        completeTask("completed", resultText)
    else
        previewLabel.Text = "No scripts were changed. " .. table.concat(failures, "\n")
        setStatus("Nothing applied: scripts changed since the proposal or the update failed.", true)
    end
    applyButton.Text = "Apply proposed changes"
    busy = false
end)

rejectButton.Activated:Connect(function()
    if busy or not connected or not currentTaskId then return end
    busy = true
    completeTask("failed", "Rejected by the user in Roblox Studio. No script changes were applied.")
    busy = false
end)

openButton.Click:Connect(function() widget.Enabled = not widget.Enabled end)
local function poll()
    if not connected or not savedToken or busy or currentTaskId then return end
    local ok, result = pcall(function() return request({action = "studio_task_poll", session_token = savedToken}) end)
    if not ok then setStatus("Bridge request failed: " .. tostring(result), true); return end
    if result.task then
        pendingProposal = nil
        updateTask("TASK FROM NEXUS\n\n" .. tostring(result.task.task or ""), result.task.id)
        previewLabel.Text = "Reading existing project scripts and asking the configured AI to prepare a proposal…"
        setStatus("Task received. Preparing a reviewable script proposal.", false)
        busy = true
        task.spawn(function()
            local ok, proposalResult = pcall(function()
                local scripts, skippedLong = collectScripts()
                if #scripts == 0 then error("No readable scripts were found in this place.") end
                local data = request({action = "studio_task_generate", session_token = savedToken, task_id = currentTaskId, scripts = scripts})
                return {proposal = data.proposal, skippedLong = skippedLong, scriptCount = #scripts}
            end)
            if ok and proposalResult.proposal then
                pendingProposal = proposalResult.proposal
                local lines = {tostring(pendingProposal.summary or "AI proposal"), "", "Provider: " .. tostring(pendingProposal.provider or "configured AI"), "Scripts inspected: " .. tostring(proposalResult.scriptCount), "Scripts omitted because they were too long or beyond the limit: " .. tostring(proposalResult.skippedLong), "", "PROPOSED CHANGES:"}
                for _, edit in ipairs(pendingProposal.edits or {}) do
                    table.insert(lines, "")
                    table.insert(lines, "• " .. tostring(edit.name or edit.path) .. " — " .. tostring(edit.reason or "Change proposed"))
                    table.insert(lines, "Path: " .. tostring(edit.path))
                    table.insert(lines, string.sub(tostring(edit.source or ""), 1, 500) .. (#tostring(edit.source or "") > 500 and "\n… (open the script to review the rest after applying)" or ""))
                end
                if #(pendingProposal.edits or {}) == 0 then table.insert(lines, "No valid script changes were proposed. Reject this task and try a more specific request.") end
                previewLabel.Text = table.concat(lines, "\n")
                updateTask("PROPOSAL READY\n\n" .. tostring(pendingProposal.summary or "") .. "\n\nReview the proposal below. Nothing has been changed yet.", currentTaskId)
                setStatus(#(pendingProposal.edits or {}) > 0 and "Proposal ready. Click Apply proposed changes to edit the game." or "The AI did not propose safe changes.", #(pendingProposal.edits or {}) == 0)
            else
                previewLabel.Text = "Proposal generation failed.\n" .. tostring(proposalResult)
                setStatus("Could not generate a proposal. Reject the task and try again.", true)
            end
            busy = false
        end)
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
