# Planner lessons

- **Check the riskiest assumption first, cheaply.** "Can pytest run in Pyodide?" was a 20-minute check
  that decided the whole design of practice mode. (Practice mode, Oct 2026)
- **One section, then stop.** The owner: "include more if we are able to successfully do one section."
- **List what's NOT included** so the owner sees the trade-offs (e.g. "AI team comes in section 2",
  "server-side verification needs a sandbox, later").
- **Security changes the plan:** running user code on our server needs a real sandbox. Plan
  browser-side execution or a sandbox step explicitly; never "just run it on the server".
