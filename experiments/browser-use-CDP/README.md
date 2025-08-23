# 

https://docs.browser-use.com/customize/real-browser

Parallel Agents, Same Profile, Different Browsers

To share a single set of configuration or cookies, but still have agents working in their own browser sessions (potentially in parallel), use our provided BrowserProfile object.
The recommended way to re-use cookies and localStorage state between separate parallel sessions is to use the storage_state option.

# open a browser to log into sites you want the Agent to have access to
playwright open https://example.com/ --save-storage=/tmp/auth.json
playwright open https://example.com/ --load-storage=/tmp/auth.json

from browser_use.browser import BrowserProfile, BrowserSession

shared_profile = BrowserProfile(
    headless=True,
    user_data_dir=None,               # use dedicated tmp user_data_dir per session
    storage_state='/tmp/auth.json',   # load/save cookies to/from json file
    keep_alive=True,                  # don't close the browser after the agent finishes
)

window1 = BrowserSession(browser_profile=shared_profile)
await window1.start()
agent1 = Agent(browser_session=window1)

window2 = BrowserSession(browser_profile=shared_profile)
await window2.start()
agent2 = Agent(browser_session=window2)

await asyncio.gather(agent1.run(), agent2.run())  # run in parallel
await window1.save_storage_state()  # write storage state (cookies, localStorage, etc.) to auth.json
await window2.save_storage_state()  # you must decide when to save manually

# can also reload the cookies from the file into the active session if they change
await window1.load_storage_state()
await window1.close()
await window2.close()

-- CEO said to use this approach to access chrome on local using CDP

then we can call python stuff from node
