# @openhandle/n8n-nodes-openhandle

This is an n8n community node for [Openhandle](https://openhandle.dev). It reads public Instagram, TikTok, X, and Reddit data inside your n8n workflows.

Look up profiles or pull an account's latest posts. You can also search hashtags. Responses use the same top-level JSON fields across all four platforms. The node also works as a tool for the n8n AI Agent.

## Install

In n8n, open **Settings > Community Nodes**, select **Install**, and enter `@openhandle/n8n-nodes-openhandle`.

The n8n docs explain [how community nodes work](https://docs.n8n.io/integrations/community-nodes/installation/).

## Credentials

1. Create a free account at [app.openhandle.dev/signup](https://app.openhandle.dev/signup). You get 100 free requests, and no card is needed.
2. Open **API Keys** in the dashboard and create a key.
3. In n8n, add an **Openhandle API** credential and paste the key.

Keys that start with `oh_live_` read real public data. Keys that start with `oh_test_` return free synthetic data. A test key is a good way to build a workflow before you spend anything. Try the Instagram **Get Profile** operation with `@northstar_forge_test`.

## Resources

| Resource  | Operations | What you can read                                                                         |
| --------- | ---------- | ----------------------------------------------------------------------------------------- |
| Instagram | 43         | Profiles, posts, reels, stories, highlights, comments, hashtags, locations, music, search |
| TikTok    | 28         | Profiles, posts, comments, playlists, hashtags, effects, music, trending lists, search    |
| X         | 15         | Profiles, posts, replies, reposters, lists, search                                        |
| Reddit    | 20         | Profiles, posts, comments, subreddits, wiki pages, trending posts, search                 |
| URL       | 1          | Paste a supported post or profile link and get the same data as the matching operation    |

Profiles take a username with an @ prefix, such as `@openai`, or the platform ID. Posts take the platform post ID or shortcode. If you only have a link, use the URL resource.

## Output

List and search operations return one n8n item for each result. Get operations return one item with the full response: `platform`, `resource`, `capturedAt`, `source`, `data`, and `meta`.

List operations read the first page by default. Each page is a separate billed request. Keep **Max Pages** low when testing with a live key. Turn on **Return All** to read more pages, up to **Max Pages** (5 by default).

## Freshness and pricing

Every operation has a **Freshness** field. It sets how old the data may be. Older cached answers cost less.

| Freshness          | Price per answered request |
| ------------------ | -------------------------- |
| Live               | $0.0025                    |
| 24 Hours (default) | $0.0005                    |
| 7 Days             | $0.0001                    |
| 30 Days            | $0                         |

The `source` field in each response tells you if the answer came from the platform just now (`live`) or from the cache (`cache`).

## Links

- [Openhandle docs](https://openhandle.dev/docs)
- [Quickstart](https://openhandle.dev/docs/quickstart)
- [Freshness and caching](https://openhandle.dev/docs/concepts/freshness-and-caching)
- [Pricing](https://openhandle.dev/pricing)
- [n8n community nodes](https://docs.n8n.io/integrations/#community-nodes)

## License

[MIT](LICENSE)
