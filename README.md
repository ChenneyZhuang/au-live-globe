# 🌏 AU Live Globe — 澳洲实时数据 3D 地球 / Live Australia on a 3D Globe

**English** | [中文见下](#中文)

A real-time 3D globe for Australia, built on the open-source
[God's Eye View](https://github.com/bilawalsidhu/gods-eye-view) (MIT) and
extended with Australian hazard-awareness layers. Every data source below is
**free, public, and keyless** — clone it, run it, deploy it, no API keys, no
cost.

Australia-focused view: the app opens over New South Wales with live bushfire
warnings, while all of the original global layers (flights, ships, satellites,
weather, earthquakes, radio, and more) keep working worldwide.

## Data sources (all keyless / all verified live)

| Layer | Source | License |
| --- | --- | --- |
| NSW bushfire incidents 新州火警 | [NSW Rural Fire Service major incidents feed](https://www.rfs.nsw.gov.au/feeds/majorIncidents.json) | CC BY 4.0 |
| QLD bushfire warnings 昆州火警 | [Queensland Fire Department current bushfire incidents](https://www.data.qld.gov.au/dataset/queensland-fire-and-rescue-current-bushfire-incidents) (via same-origin `/api/qld-fires` proxy) | CC BY 4.0 |
| Global earthquakes 全球地震 | [USGS Earthquake Hazards Program](https://earthquake.usgs.gov/) | Public domain |
| Live flights 全球航班 | [OpenSky Network](https://opensky-network.org/) / [adsb.lol](https://adsb.lol/) | Non-commercial / ODbL |
| Live ships 全球船舶 | [AISStream](https://aisstream.io/) | Free beta, no formal ToS (public AIS broadcast) |
| Weather 天气 | [Open-Meteo](https://open-meteo.com/) | CC BY 4.0 |
| Traffic cameras 交通摄像头 (NSW) | [Live Traffic NSW](https://www.livetraffic.com/) | CC BY 4.0 |
| Satellites 卫星 | [CelesTrak](https://celestrak.org/) | US-government data, citation requested |
| 3D tiles & basemap 底图 | Esri / Re:Earth / Cesium ion (keyless mode) | Per upstream DATA_SOURCES.md |

Full upstream attribution table: [DATA_SOURCES.md](DATA_SOURCES.md).
Original project README: [docs/UPSTREAM-README.md](docs/UPSTREAM-README.md).

## Run it 本地运行

```bash
npm install
npm run dev        # http://localhost:4173
npm test           # unit tests (2 known macOS tmpdir failures are environmental)
```

The QLD bushfire layer reads through `/api/qld-fires`. In `npm run dev` and
`npm run preview` this is served by the built-in vite middleware; on
Cloudflare Pages it is served by the Pages Function in `functions/api/`.
No other layer needs a server.

## Deploy (Cloudflare Pages, free) 部署

```bash
npm run build      # static build → dist/
npx wrangler pages deploy dist
```

The `functions/` directory is picked up automatically by Cloudflare Pages —
no extra configuration. Any static host works too; only the QLD layer needs
the proxy to be re-implemented (it is a ~30-line pass-through).

## 中文

**AU Live Globe** 是一个面向澳洲的实时 3D 数据地球，基于开源项目
[God's Eye View](https://github.com/bilawalsidhu/gods-eye-view)（MIT 协议，
32k+ star）改造：定位"全球地球 + 澳洲加强"，以灾害应急视角为主打。

- **零 API key、零成本**：所有数据源均为免费公开数据，克隆即可运行，静态托管即可部署。
- **澳洲火灾应急层**：开屏定位新州（NSW），接入新州乡村消防局（RFS）与昆州消防局（QFD）
  的实时火警 feed，按 Emergency Warning（紧急警告）/ Watch and Act（观察行动）/
  Advice（建议）等级着色显示火点与火场范围。
- **保留全部全球图层**：航班、船舶、卫星、地震、天气、电台、交通摄像头等原版功能全部可用。
- **双语标注**：澳洲数据层在面板与详情框中带中文标注（新州火警 / 昆州火警）。

### 数据源署名

| 图层 | 来源 | 许可 |
| --- | --- | --- |
| 新州火警 | [NSW 乡村消防局 majorIncidents](https://www.rfs.nsw.gov.au/feeds/majorIncidents.json) | CC BY 4.0 |
| 昆州火警 | [昆州消防局 current bushfire incidents](https://www.data.qld.gov.au/dataset/queensland-fire-and-rescue-current-bushfire-incidents)（经同源 `/api/qld-fires` 代理） | CC BY 4.0 |
| 全球地震 | [USGS](https://earthquake.usgs.gov/) | 公有领域 |
| 全球航班 | [OpenSky](https://opensky-network.org/) / [adsb.lol](https://adsb.lol/) | 非商用 / ODbL |
| 船舶 | [AISStream](https://aisstream.io/) | Free beta，无正式 ToS（AIS 为公开广播） |
| 天气 | [Open-Meteo](https://open-meteo.com/) | CC BY 4.0 |
| 交通摄像头 (NSW) | [Live Traffic NSW](https://www.livetraffic.com/) | CC BY 4.0 |
| 卫星 | [CelesTrak](https://celestrak.org/) | 美国政府数据，建议引用 |

完整上游署名清单见 [DATA_SOURCES.md](DATA_SOURCES.md)。

### 运行 / 部署

```bash
npm install
npm run dev        # 开发服务器 http://localhost:4173
npm run build      # 静态构建 → dist/
npx wrangler pages deploy dist   # Cloudflare Pages 免费部署
```

昆州火警层经 `/api/qld-fires` 同源代理读取（上游 S3 无 CORS 头）：开发与预览由
vite 中间件提供，生产由 `functions/api/` 的 Cloudflare Pages Function 提供，
其余图层全部浏览器直连、纯静态可用。

## License

Code: MIT (upstream God's Eye View by Bilawal Sidhu and contributors, plus
this fork's changes). Each data layer remains governed by its provider's
license — see DATA_SOURCES.md.
