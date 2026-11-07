# Debug Session: hls-stutter-latency

- **Status**: [OPEN]
- **progress_status**: analyzed
- **Issue**: HLS 播放卡顿（中国大陆访问 `http://media.laybackzzz.com/HLS/.../master.m3u8`）。Stats for nerds 显示 Connection Speed 高达 ~27000 Kbps、Serving Node 为 LHR/AMS，但播放仍持续卡顿、缓冲饥饿。
- **Evidence Source**: HTTP Debug Server
- **Evidence Directory**: /tmp/trae-debug-hls-stutter-latency
- **Debug Server**: http://127.0.0.1:7779/event
- **Log File**: /tmp/trae-debug-hls-stutter-latency/trae-debug-log-hls-stutter-latency.ndjson

## Reproduction Steps

1. 打开 http://127.0.0.1:5173/ 播放页。
2. 播放源 `http://media.laybackzzz.com/HLS/tt0111756/H264/master.m3u8`（默认 720P）。
3. 连续播放 111 秒。出现多次卡顿。
4. 采集到 160 条事件（A=35 / B=109 / C=16）。

## Hypotheses & Verification

| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | 国际链路（CN→AMS/SJC）TTFB 高、实际吞吐低且抖动，分片下载耗时超过其媒体时长 → 缓冲入不敷出 | High | Low | **CONFIRMED** |
| B | `maxBufferLength: 30` 导致前向缓冲上限偏低，抗抖动不足 | Med | Low | **REJECTED** |
| C | 真实卡顿事件频繁出现，且与网络慢强相关 | High | Low | **CONFIRMED** |
| D | 卡顿来自解码瓶颈（dropped frames 持续增长） | Low | Low | **REJECTED** |
| E | `hls.bandwidthEstimate` 虚高，ABR/UI 误判链路健康度 | High | Low | **CONFIRMED** |

## Log Evidence

### 1) 码率阶梯（master.m3u8，shaka-packager v3.9.3）
| 档位 | BANDWIDTH | AVERAGE-BANDWIDTH |
|------|-----------|-------------------|
| 1080p | 4135318 | 3100718 |
| **720p** | 2430200 | **1787369** |
| 480p | 1185096 | 918481 |
| 360p | 815245 | 650688 |
| audio | 815245(BW) | 650688 |

### 2) 每分片网络计时（`FRAG_LOADED`，27 条）
- 全部由 **AMS（阿姆斯特丹）** 节点服务，`colo=AMS`。
- TTFB：**651–1664 ms**（早期）→ 后期仍 700–1400 ms。
- 720p 分片（~1.2–1.6 MB）下载耗时：早期 2.2–5.9 s（可跟上），
  **t=45.7s 起劣化到 8.4–21.1 s**，吞吐跌至 **424–1527 kbps**，远低于 720p 平均码率 1787 kbps。

```
+ 45.7s L2 720/807.m4s bytes=1236071 ttfb=1151ms dl=21107ms tp=468k  lvlBr=2430k ratio=0.19 buf=0.08s colo=AMS
+ 60.8s L2 720/808.m4s bytes=1271353 ttfb=742ms  dl=15099ms tp=673k  lvlBr=2430k ratio=0.28 buf=0.07s colo=AMS
+ 72.1s L2 720/809.m4s bytes=1496818 ttfb=1224ms dl=11320ms tp=1057k lvlBr=2430k ratio=0.44 buf=0.09s colo=AMS
+ 94.1s L2 720/811.m4s bytes=1354283 ttfb=1038ms dl=12071ms tp=897k  lvlBr=2430k ratio=0.37 buf=0.09s colo=AMS
```

### 3) 播放卡顿事件（`video` waiting/stalled）
111 秒内 **8 次 `bufferStalledError`**，`waiting` 时缓冲水位恒为 **0.07–0.09 s**：

```
+38.3s bufferStalledError  waiting buf=0.08s
+51.7s bufferStalledError  waiting buf=0.07s
+66.8s bufferStalledError  waiting buf=0.09s
+78.2s bufferStalledError  waiting buf=0.07s
+88.1s bufferStalledError  waiting buf=0.09s
+94.1s bufferNudgeOnStall  waiting buf=1.09s
+100.2s bufferStalledError waiting buf=0.08s
+108.5s bufferStalledError waiting buf=0.07s
```

缓冲呈 **0 → 6s → 0** 的锯齿，每轮约 6 秒（恰为一个分片时长），
`currentTime` 每次推进 6s 但墙钟耗时 ~13s → **有效播放速度 ≈ 0.45x**。

### 4) 缓冲上限（否定 B）
缓冲峰值仅 13.3s（早期）/ 6s（后期），**从未接近 30s 上限**。
`maxBufferLength` 不是约束项，调大无助于吞吐不足。

### 5) 掉帧（否定 D）
`droppedFramesDelta` 几乎全为 0，仅恢复播放瞬间出现 ≤6 帧。
非解码问题，播放本身平滑，只是被饿死。

### 6) 带宽估计虚高（证实 E）
`bandwidthEstimate` 与实测 5s 吞吐之比 **1.46–23.06x**：

```
 t     est(k)  act5s(k)  est/act  buf(s)
 8.1     5184     2427     2.14     6.27
16.1     5360      232    23.06    10.26
46.1      506        0     None     5.65   <- 卡顿后估计值才被动回落
```

> `est` 是瞬时下载速率的 EWMA，**不含 RTT / 抖动 / 丢包**，因此「Connection Speed 27000 Kbps 却卡」是必然——该数值不代表可持续吞吐。

### 7) 本机直连复测（curl）
- 持续顺序拉 6 个 720p 分片：**8624932 B / 26.98 s = 2.56 Mbps**（仅为 720p 需求的 1.43x，无抗抖动余量）。
- IPv4：TTFB 0.44–0.68 s，286–331 KB/s（2.3–2.65 Mbps），`cf-ray …-AMS`。
- IPv6：TTFB 0.44–1.55 s（抖动大），198–379 KB/s，`cf-ray …-AMS`。
- 出口 `curl https://www.cloudflare.com/cdn-cgi/trace` → `ip=240e:…`（中国电信 IPv6）、**`loc=CN`**、**`colo=SJC`**。
- 路由 `route get 104.21.6.15` → `interface: en0`（**未经本地代理**）。
- 缓存正常：`cf-cache-status: HIT`、`Server: cloudflare`、`Age` 递增。

## Verification Conclusion

**根因（CONFIRMED）**：中国大陆电信到 Cloudflare 的**调度落点被分到欧美节点（AMS/SJC）**，
国际链路可持续吞吐约 2.3–2.6 Mbps、抖动大，**仅略高于 720p 平均码率 1787 kbps**，无余量；
浏览器实测分片吞吐更低至 424–1527 kbps，低于码率 → 前向缓冲每 ~6 s 被抽干一次 → 卡顿。
CDN 缓存、播放器解码、码率锁定均无问题。

**"27000 Kbps 还卡" 的解释**：该数值是 `hls.bandwidthEstimate`（瞬时下载速率 EWMA），
实测虚高 1.46–23x，且不含延迟/抖动，不能作为流畅度判据。

**排除项**：`maxBufferLength` 非约束（B）；非解码掉帧（D）。

**待决**：修复方向取决于网络/内容/播放器三层取舍，需用户确认后再动手。

## Final Evidence Gate

- **Evidence Sources**: /tmp/trae-debug-hls-stutter-latency/trae-debug-log-hls-stutter-latency.ndjson ; http://127.0.0.1:7779/logs ; 本机 curl 复测
- **progress_status**: analyzed
- **Hypothesis Conclusions**: A=CONFIRMED, B=REJECTED, C=CONFIRMED, D=REJECTED, E=CONFIRMED
