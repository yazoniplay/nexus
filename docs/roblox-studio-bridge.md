# Nexus ↔ Roblox Studio bridge (MVP)

This first milestone securely pairs a Roblox Studio plugin with Nexus and delivers human-reviewed tasks. It does **not** execute generated code, edit scripts, or run playtests yet.

## 1. Apply the database migration

In the Supabase dashboard for the project used by Nexus, open **SQL Editor** and run the contents of `supabase/migrations/202610270001_roblox_studio_bridge.sql`.

The two tables have RLS enabled and no public policies. Only the Edge Function service role should access them.

## 2. Deploy the Edge Function

Deploy the updated `supabase/functions/nexus-ai/index.ts` to the same Supabase project as the Nexus website. Ensure Edge Function secrets `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set. Never put the service-role key in frontend code or the Studio plugin.

## 3. Publish the website

Publish the updated frontend files from the same source folder used by the existing Nexus website. Open `roblox.html`, create a pairing code, then enter that code in the Studio plugin. Codes expire after 10 minutes and can only be used once.

## 4. Install the Studio plugin

1. In Roblox Studio, open **Plugins → Create New Plugin** (or use your existing local plugin workflow).
2. Paste `roblox-plugin/NexusStudioBridge.plugin.lua` into the plugin script and save it as a local plugin.
3. Open **Plugins → Nexus Bridge**.
4. Create a code on the Nexus website, enter the 8 digits in Studio, and click **Pair with Nexus**.
5. Send a task from Nexus. The plugin checks for tasks about every 15 seconds. A task is displayed for human review; acknowledging it does not apply code.

## Security notes

- The website stores the pairing session token in that browser's local storage. Do not use the pairing page on a shared device.
- The plugin stores its token in Studio plugin settings. Disconnect from both sides if the device is no longer trusted.
- Never share the token or publish it in a repository.
- Pairing codes expire after 10 minutes and are single-use.
- This is an initial task bridge, not a code-execution agent. Script reading/editing, per-change approval, and playtest feedback are follow-up milestones.
