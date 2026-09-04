# Etherscan MCP

Connects Claude Code to live Etherscan API data (60+ chains) over MCP.

- **Server:** `https://mcp.etherscan.io/mcp` (the only official one — ignore marketplace clones)
- **Transport:** Streamable HTTP
- **Auth:** `Authorization: Bearer <ETHERSCAN_API_KEY>`
- **Docs:** https://docs.etherscan.io/etherscan-mcp

The repo ships `.mcp.json` at the root, which reads the key from the
`ETHERSCAN_API_KEY` environment variable. The key is never committed.

## Local (Claude Code CLI)

```bash
export ETHERSCAN_API_KEY=YourApiKey   # or put it in your shell profile
claude            # approve the project-scoped "etherscan" server when prompted
claude mcp get etherscan   # expect: Status: ✔ Connected
```

Adding it as a user-scoped server instead (available in every project):

```bash
claude mcp add --transport http etherscan \
  https://mcp.etherscan.io/mcp \
  --header "Authorization: Bearer YourApiKey"
```

## Claude Code on the web (claude.ai/code)

Two things are required, both set on the **environment**, not in this repo:

1. `ETHERSCAN_API_KEY` as an environment variable.
2. A network policy that allows outbound HTTPS to `mcp.etherscan.io`
   (and `api.etherscan.io` if you want to call the REST API directly).
   With the default restricted policy the proxy returns `403` on CONNECT
   and every tool call fails.

MCP servers are loaded when a session starts, so change these first, then
start a new session.

## Chain selection

One connection covers every chain — pass `chainid` (Ethereum `1`,
Arbitrum `42161`, Base `8453`, ...). `get_supported_chains` lists them all.

## Notes

- Read-only: no tool signs or sends a transaction.
- Every tool call consumes Etherscan API quota.
- `get_address_labels` and other Pro tools need a paid Etherscan plan.
