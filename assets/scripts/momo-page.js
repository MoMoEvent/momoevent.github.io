const DATA_URL = "assets/data/momo-page-data.json";

const state = {
    data: null,
    v2tIndex: 0,
    t2vIndex: 0,
    v2tSelectedQueryId: null,
    t2vSelectedVideoId: null,
    resultTableId: null,
};

function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) {
        element.className = className;
    }
    if (text !== undefined && text !== null) {
        element.textContent = text;
    }
    return element;
}

function clearNode(node) {
    while (node.firstChild) {
        node.removeChild(node.firstChild);
    }
}

function previewText(text, maxLength = 120) {
    if (!text) {
        return "";
    }
    if (text.length <= maxLength) {
        return text;
    }
    return `${text.slice(0, maxLength - 3).trim()}...`;
}

function parseTimeToSeconds(value) {
    if (!value || typeof value !== "string") {
        return 0;
    }
    const parts = value.split(":").map((part) => Number(part));
    if (parts.some((part) => Number.isNaN(part))) {
        return 0;
    }
    if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    if (parts.length === 2) {
        return parts[0] * 60 + parts[1];
    }
    return parts[0] || 0;
}

function getRangeSeconds(range) {
    const start = parseTimeToSeconds(range?.[0]);
    const end = parseTimeToSeconds(range?.[1]);
    return { start, end: Math.max(end, start + 1) };
}

function coerceSeconds(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string") {
        return parseTimeToSeconds(value);
    }
    return 0;
}

function formatSeconds(value) {
    const seconds = Math.max(0, Math.round(coerceSeconds(value)));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
    }
    return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function formatTimestampRange(timestamp) {
    if (!Array.isArray(timestamp) || timestamp.length < 2) {
        return "";
    }
    return `${formatSeconds(timestamp[0])} - ${formatSeconds(timestamp[1])}`;
}

function formatTimeRelation(raw) {
    const relationMap = {
        "起始节点": "Start",
        "同时发生": "Simultaneous",
        "之后发生": "After",
        "之前发生": "Before",
    };
    return relationMap[raw] || raw || "Unordered";
}

function createBadge(className, text) {
    return createElement("span", className, text);
}

function seekVideo(videoElement, seconds) {
    if (!videoElement || typeof videoElement.currentTime !== "number") {
        return;
    }
    videoElement.currentTime = seconds;
    const playPromise = videoElement.play();
    if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {});
    }
}

function findV2TFocusedItem(caseData) {
    const items = [...caseData.best_topk, ...caseData.baseline_topk, ...caseData.positive_texts];
    if (state.v2tSelectedQueryId) {
        const found = items.find((item) => item.query_id === state.v2tSelectedQueryId);
        if (found) {
            return found;
        }
    }
    return caseData.best_topk[0] || caseData.positive_texts[0] || caseData.baseline_topk[0] || null;
}

function findT2VFocusedVideo(caseData) {
    const items = [...caseData.best_top5, ...caseData.baseline_top5];
    if (state.t2vSelectedVideoId) {
        const found = items.find((item) => item.video_id === state.t2vSelectedVideoId);
        if (found) {
            return found;
        }
    }
    return caseData.best_top5[0] || caseData.baseline_top5[0] || null;
}

function createVideoElement(src, className, { autoplay = false, controls = false } = {}) {
    const video = createElement("video", className);
    video.playsInline = true;
    video.muted = true;
    video.loop = true;
    video.preload = "metadata";
    if (controls) {
        video.controls = true;
    }
    if (autoplay) {
        video.autoplay = true;
    }
    if (src) {
        video.src = src;
    }
    return video;
}

function isBrowserFriendlyVideo(src) {
    return Boolean(src && /\.(mp4|webm|mov)$/i.test(src));
}

function createVideoPreview(src, { className = "feature-video", autoplay = false, controls = false, fallbackMessage } = {}) {
    if (!isBrowserFriendlyVideo(src)) {
        const fallback = createElement("div", "empty-card");
        fallback.appendChild(
            createElement(
                "p",
                "",
                fallbackMessage || "A local video asset exists for this item, but its current file format may not preview reliably in the browser."
            )
        );
        return fallback;
    }
    return createVideoElement(src, className, { autoplay, controls });
}

function renderTextTree(tree, titleText) {
    const wrapper = createElement("div", "tree-shell");
    if (titleText) {
        wrapper.appendChild(createElement("p", "tree-source-text", titleText));
    }

    if (!tree || !Array.isArray(tree.actions) || tree.actions.length === 0) {
        wrapper.appendChild(createElement("div", "empty-card", "No text decomposition is available for this item."));
        return wrapper;
    }

    const sceneRow = createElement("div", "chip-row");
    (tree.scenes || []).forEach((scene) => {
        sceneRow.appendChild(createElement("span", "chip", scene.scene));
    });
    if (tree.scenes && tree.scenes.length > 0) {
        wrapper.appendChild(sceneRow);
    }

    const actionList = createElement("div", "tree-action-list");
    tree.actions.forEach((action, index) => {
        const actionCard = createElement("article", "tree-action");
        actionCard.appendChild(createElement("span", "tree-index", String(index + 1)));

        const copy = createElement("div", "tree-copy");
        copy.appendChild(createElement("h4", "", action.action || `Action ${index + 1}`));
        copy.appendChild(createElement("p", "", formatTimeRelation(action.time_relation)));
        actionCard.appendChild(copy);
        actionList.appendChild(actionCard);
    });

    wrapper.appendChild(actionList);
    return wrapper;
}

function renderVideoTree(tree, { videoElement = null } = {}) {
    const wrapper = createElement("div", "tree-shell");
    if (!tree || !Array.isArray(tree.leaf_segments) || tree.leaf_segments.length === 0) {
        wrapper.appendChild(createElement("div", "empty-card", "No video segmentation is available for this video."));
        return wrapper;
    }

    const map = createElement("div", "video-map");
    const leafRanges = new Map();
    const totalSeconds = Math.max(...tree.leaf_segments.map((segment) => getRangeSeconds(segment.range).end), 1);

    const addLane = (label, items, toneOffset = 0) => {
        if (!items || items.length === 0) {
            return;
        }

        const row = createElement("div", `video-map-row video-map-row-${label}`);
        row.appendChild(createElement("span", "video-map-label", label));
        const lane = createElement("div", "video-map-lane");
        items.forEach((item, index) => {
            const startPercent = Math.max(0, Math.min(100, (item.start / totalSeconds) * 100));
            const widthPercent = Math.max(1.5, Math.min(100 - startPercent, ((item.end - item.start) / totalSeconds) * 100));
            const segment = createElement("button", `video-map-segment tone-${(index + toneOffset) % 6}`);
            segment.type = "button";
            segment.style.left = `${startPercent}%`;
            segment.style.width = `${widthPercent}%`;
            segment.title = item.title;
            segment.addEventListener("click", () => seekVideo(videoElement, item.start));
            segment.appendChild(createElement("span", "", item.shortLabel));
            lane.appendChild(segment);
        });
        row.appendChild(lane);
        map.appendChild(row);
    };

    const leafItems = tree.leaf_segments.map((segment, index) => {
        const range = getRangeSeconds(segment.range);
        leafRanges.set(segment.id, range);
        return {
            ...range,
            title: `${(segment.range || []).join(" - ")} - ${segment.label || "Unnamed segment"}`,
            shortLabel: tree.leaf_segments.length > 18 ? "" : String(index + 1),
        };
    });
    addLane("segments", leafItems, 0);

    const knownRanges = new Map(leafRanges);
    const parentLayer = (tree.layers || [])[0];
    if (parentLayer) {
        const eventItems = [];
        (parentLayer.nodes || []).forEach((node, nodeIndex) => {
            const children = node.children || [];
            const childRanges = children.map((childId) => knownRanges.get(childId)).filter(Boolean);
            if (childRanges.length === 0) {
                return;
            }
            const start = Math.min(...childRanges.map((range) => range.start));
            const end = Math.max(...childRanges.map((range) => range.end));
            eventItems.push({
                start,
                end,
                title: node.label || `Group ${nodeIndex + 1}`,
                shortLabel: node.label || `G${nodeIndex + 1}`,
            });
        });
        addLane("events", eventItems, 2);
    }

    wrapper.appendChild(map);
    const labelPanel = createElement("div", "segment-label-panel");
    labelPanel.appendChild(createElement("h4", "", "Visual segment labels"));
    const labelNote = createElement("p", "segment-label-note");
    labelNote.appendChild(
        createElement("strong", "", "* Segment text is shown only to make video segments readable; it is not part of the retrieval input.")
    );
    labelPanel.appendChild(labelNote);
    const labelList = createElement("div", "segment-label-list");
    tree.leaf_segments.forEach((segment, index) => {
        const range = getRangeSeconds(segment.range);
        const item = createElement("button", "segment-label-item");
        item.type = "button";
        item.addEventListener("click", () => seekVideo(videoElement, range.start));
        item.appendChild(createElement("span", "segment-label-index", String(index + 1)));
        const copy = createElement("span", "segment-label-copy");
        copy.appendChild(createElement("strong", "", segment.label || "Unnamed segment"));
        copy.appendChild(createElement("small", "", (segment.range || []).join(" - ")));
        item.appendChild(copy);
        labelList.appendChild(item);
    });
    labelPanel.appendChild(labelList);
    wrapper.appendChild(labelPanel);
    return wrapper;
}

function renderAnnotationList(annotation, { videoElement = null, title = "Ground-truth captions", maxItems = 4 } = {}) {
    const wrapper = createElement("div", "annotation-panel");
    wrapper.appendChild(createElement("h4", "", title));

    const list = createElement("ul", "annotation-list");
    const sentences = Array.isArray(annotation?.sentences) ? annotation.sentences.slice(0, maxItems) : [];
    const timestamps = Array.isArray(annotation?.timestamps) ? annotation.timestamps : [];
    sentences.forEach((sentence, index) => {
        const timestamp = timestamps[index];
        const timeLabel = formatTimestampRange(timestamp);
        const item = createElement("li");

        if (timeLabel && videoElement) {
            const button = createElement("button", "annotation-button");
            button.type = "button";
            button.addEventListener("click", () => seekVideo(videoElement, coerceSeconds(timestamp[0])));
            button.appendChild(createElement("span", "annotation-time", timeLabel));
            button.appendChild(createElement("span", "annotation-text", sentence.trim()));
            item.appendChild(button);
        } else {
            const copy = createElement("span", "annotation-static");
            if (timeLabel) {
                copy.appendChild(createElement("span", "annotation-time", timeLabel));
            }
            copy.appendChild(createElement("span", "annotation-text", sentence.trim()));
            item.appendChild(copy);
        }
        list.appendChild(item);
    });
    wrapper.appendChild(list);
    if (sentences.length === 0) {
        wrapper.appendChild(createElement("p", "annotation-empty", "No ground-truth captions are available for this video."));
    }
    return wrapper;
}

function renderTextResultItem(item, { active, onClick }) {
    const button = createElement("button", "result-item text-result-item");
    button.type = "button";
    if (active) {
        button.classList.add("is-active");
    }
    if (item.is_pos) {
        button.classList.add("is-positive");
    }
    button.addEventListener("click", onClick);

    const topline = createElement("div", "result-item-top");
    topline.appendChild(createElement("span", "rank-tag", `#${item.rank || "?"}`));
    topline.appendChild(createElement("span", "result-id", item.query_id));
    if (item.is_pos) {
        topline.appendChild(createBadge("gt-badge", "GT text"));
    }
    button.appendChild(topline);
    button.appendChild(createElement("h4", "", previewText(item.text, 132)));
    return button;
}

function renderVideoResultCard(item, { active, onClick }) {
    const button = createElement("article", "video-result-card");
    button.tabIndex = 0;
    button.setAttribute("role", "button");
    button.setAttribute("aria-label", item.video_id || "Retrieved video");
    button.dataset.videoId = item.video_id || "";
    if (active) {
        button.classList.add("is-active");
    }
    if (item.is_gt) {
        button.classList.add("is-gt");
    }
    button.addEventListener("click", onClick);
    button.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onClick();
        }
    });

    const mediaWrap = createElement("div", "video-result-media");
    mediaWrap.appendChild(
        createVideoPreview(item.media?.src, {
            className: "video-result-preview",
            autoplay: true,
            fallbackMessage: "Preview unavailable",
        })
    );
    button.appendChild(mediaWrap);

    const copy = createElement("div", "video-result-copy");
    const topline = createElement("div", "result-item-top");
    topline.appendChild(createElement("span", "rank-tag", `#${item.rank || "?"}`));
    if (item.is_gt) {
        topline.appendChild(createBadge("gt-badge", "GT video"));
    }
    copy.appendChild(topline);
    copy.appendChild(createElement("h4", "", item.video_id || "Retrieved video"));
    copy.appendChild(createElement("p", "", previewText((item.annotation?.sentences || []).join(" "), 116)));
    button.appendChild(copy);
    return button;
}

function renderTextResultGroup(title, badgeText, badgeClass, items, activeQueryId, onSelect) {
    const group = createElement("section", "result-group");
    const header = createElement("div", "result-column-header");
    header.appendChild(createElement("h3", "", title));
    header.appendChild(createBadge(`column-badge ${badgeClass}`, badgeText));
    group.appendChild(header);

    const list = createElement("div", "result-list compact-result-list");
    items.forEach((item) => {
        list.appendChild(
            renderTextResultItem(item, {
                active: item.query_id === activeQueryId,
                onClick: () => onSelect(item),
            })
        );
    });
    group.appendChild(list);
    return group;
}

function renderVideoResultGroup(title, badgeText, badgeClass, items, activeVideoId, onSelect) {
    const group = createElement("section", "video-result-group");
    const header = createElement("div", "result-column-header");
    header.appendChild(createElement("h3", "", title));
    header.appendChild(createBadge(`column-badge ${badgeClass}`, badgeText));
    group.appendChild(header);

    const list = createElement("div", "video-result-list");
    items.forEach((item) => {
        list.appendChild(
            renderVideoResultCard(item, {
                active: item.video_id === activeVideoId,
                onClick: () => onSelect(item),
            })
        );
    });
    group.appendChild(list);
    return group;
}

function renderV2TDetail() {
    const root = document.querySelector("[data-role='v2t-detail']");
    clearNode(root);
    const caseData = state.data.video_to_text[state.v2tIndex];
    if (!caseData) {
        root.appendChild(createElement("div", "empty-card", "No Video2Text case is available."));
        return;
    }

    const focusedItem = findV2TFocusedItem(caseData);
    state.v2tSelectedQueryId = focusedItem ? focusedItem.query_id : null;

    const detailGrid = createElement("div", "detail-grid v2t-detail-grid");

    const mediaPanel = createElement("article", "panel panel-primary media-panel");
    const mediaTop = createElement("div", "panel-topline");
    const mediaTitleWrap = createElement("div", "");
    mediaTitleWrap.appendChild(createElement("h3", "", "Query video"));
    mediaTitleWrap.appendChild(createElement("p", "panel-subtitle", caseData.video_id));
    mediaTop.appendChild(mediaTitleWrap);
    mediaPanel.appendChild(mediaTop);
    const queryVideo = createVideoPreview(caseData.media?.src, {
        className: "feature-video",
        autoplay: true,
        controls: true,
        fallbackMessage: "The selected query video is available locally, but its file format is not ideal for in-browser preview.",
    });
    mediaPanel.appendChild(queryVideo);
    mediaPanel.appendChild(renderVideoTree(caseData.video_tree, { videoElement: queryVideo }));
    mediaPanel.appendChild(
        renderAnnotationList(caseData.annotation, {
            videoElement: queryVideo,
            title: "GT captions with timestamps",
            maxItems: 6,
        })
    );
    detailGrid.appendChild(mediaPanel);

    const resultPanel = createElement("article", "panel retrieval-side-panel");
    const inspector = createElement("div", "result-inspector");
    inspector.appendChild(createElement("h3", "", "Top retrieved text decomposition"));
    inspector.appendChild(
        renderTextTree(
            focusedItem?.tree,
            focusedItem ? previewText(focusedItem.text, 144) : "Select a retrieved text item to inspect its tree."
        )
    );
    resultPanel.appendChild(inspector);

    const compactResults = createElement("div", "stacked-results");
    const selectTextItem = (item) => {
        state.v2tSelectedQueryId = item.query_id;
        renderV2TDetail();
    };
    compactResults.appendChild(
        renderTextResultGroup("Momo (ours)", "Ours", "best", caseData.best_topk, state.v2tSelectedQueryId, selectTextItem)
    );
    compactResults.appendChild(
        renderTextResultGroup(
            "Baseline (InternVideo2+Flat)",
            "Flat",
            "baseline",
            caseData.baseline_topk,
            state.v2tSelectedQueryId,
            selectTextItem
        )
    );
    resultPanel.appendChild(compactResults);
    detailGrid.appendChild(resultPanel);

    root.appendChild(detailGrid);
    autoPlayVideos(root);
}

function renderT2VDetail() {
    const root = document.querySelector("[data-role='t2v-detail']");
    clearNode(root);
    const caseData = state.data.text_to_video[state.t2vIndex];
    if (!caseData) {
        root.appendChild(createElement("div", "empty-card", "No Text2Video case is available."));
        return;
    }

    const focusedVideo = findT2VFocusedVideo(caseData);
    state.t2vSelectedVideoId = focusedVideo ? focusedVideo.video_id : null;

    const queryPanel = createElement("article", "panel panel-primary structure-panel query-wide-panel");
    const queryTop = createElement("div", "panel-topline");
    const queryTitleWrap = createElement("div", "");
    queryTitleWrap.appendChild(createElement("h3", "", "Query text"));
    queryTitleWrap.appendChild(createElement("p", "panel-subtitle", caseData.query_id));
    queryTop.appendChild(queryTitleWrap);
    queryPanel.appendChild(queryTop);
    queryPanel.appendChild(renderTextTree(caseData.query_tree, caseData.query_text));
    root.appendChild(queryPanel);

    const resultBoard = createElement("div", "video-results-board");
    const selectVideoItem = (item) => {
        state.t2vSelectedVideoId = item.video_id;
        renderT2VSelectedVideo();
    };
    resultBoard.appendChild(
        renderVideoResultGroup("Momo (ours)", "Ours", "best", caseData.best_top5, state.t2vSelectedVideoId, selectVideoItem)
    );
    resultBoard.appendChild(
        renderVideoResultGroup(
            "Baseline (InternVideo2+Flat)",
            "Flat",
            "baseline",
            caseData.baseline_top5,
            state.t2vSelectedVideoId,
            selectVideoItem
        )
    );
    root.appendChild(resultBoard);

    const videoPanel = createElement("article", "panel media-panel focused-video-panel");
    videoPanel.setAttribute("data-role", "t2v-selected-video");
    root.appendChild(videoPanel);
    renderT2VSelectedVideo();
    autoPlayVideos(resultBoard);
}

function renderT2VSelectedVideo() {
    const videoPanel = document.querySelector("[data-role='t2v-selected-video']");
    if (!videoPanel) {
        return;
    }
    clearNode(videoPanel);
    const caseData = state.data.text_to_video[state.t2vIndex];
    const focusedVideo = findT2VFocusedVideo(caseData);
    state.t2vSelectedVideoId = focusedVideo ? focusedVideo.video_id : null;

    document.querySelectorAll("[data-role='t2v-detail'] .video-result-card").forEach((card) => {
        card.classList.toggle("is-active", card.dataset.videoId === state.t2vSelectedVideoId);
    });

    videoPanel.appendChild(createElement("h3", "", "Selected video evidence"));
    if (focusedVideo) {
        const retrievedVideo = createVideoPreview(focusedVideo.media?.src, {
            className: "feature-video",
            autoplay: true,
            controls: true,
            fallbackMessage: "This retrieved result is available locally, but the current file format may not preview reliably in the browser.",
        });
        videoPanel.appendChild(retrievedVideo);
        videoPanel.appendChild(renderVideoTree(focusedVideo.video_tree, { videoElement: retrievedVideo }));
        videoPanel.appendChild(
            renderAnnotationList(focusedVideo.annotation, {
                videoElement: retrievedVideo,
                title: focusedVideo.is_gt ? "GT video captions with timestamps" : "Retrieved video captions",
                maxItems: 6,
            })
        );
    } else {
        videoPanel.appendChild(createElement("div", "empty-card", "No retrieved video is available."));
    }
    autoPlayVideos(videoPanel);
}

function syncMarqueeActive(targetSelector, activeIndex) {
    const root = document.querySelector(targetSelector);
    if (!root) {
        return;
    }
    root.querySelectorAll(".marquee-item").forEach((item) => {
        item.classList.toggle("is-active", Number(item.dataset.caseIndex) === activeIndex);
    });
}

function renderV2TSelection() {
    syncMarqueeActive("[data-role='v2t-marquee']", state.v2tIndex);
    renderV2TDetail();
}

function renderT2VSelection() {
    syncMarqueeActive("[data-role='t2v-marquee']", state.t2vIndex);
    renderT2VDetail();
}

function buildV2TMarqueeItem(caseData, index) {
    const button = createElement("button", "marquee-item marquee-item-video-only");
    button.type = "button";
    button.dataset.caseIndex = String(index);
    button.setAttribute("aria-label", caseData.video_id);
    if (index === state.v2tIndex) {
        button.classList.add("is-active");
    }
    button.addEventListener("click", () => {
        if (state.v2tIndex === index) {
            syncMarqueeActive("[data-role='v2t-marquee']", state.v2tIndex);
            return;
        }
        state.v2tIndex = index;
        state.v2tSelectedQueryId = null;
        renderV2TSelection();
    });

    button.appendChild(
        createVideoPreview(caseData.media?.src, {
            className: "marquee-video",
            autoplay: true,
            fallbackMessage: "Preview unavailable",
        })
    );
    return button;
}

function buildT2VMarqueeItem(caseData, index) {
    const button = createElement("button", "marquee-item");
    button.type = "button";
    button.dataset.caseIndex = String(index);
    if (index === state.t2vIndex) {
        button.classList.add("is-active");
    }
    button.addEventListener("click", () => {
        if (state.t2vIndex === index) {
            syncMarqueeActive("[data-role='t2v-marquee']", state.t2vIndex);
            return;
        }
        state.t2vIndex = index;
        state.t2vSelectedVideoId = null;
        renderT2VSelection();
    });

    const headline = createElement("div", "marquee-video marquee-text-block");
    headline.appendChild(createElement("strong", "", previewText(caseData.query_text, 112)));
    button.appendChild(headline);

    const copy = createElement("div", "marquee-copy");
    copy.appendChild(createElement("h3", "", caseData.query_id));
    button.appendChild(copy);
    return button;
}

function renderMarquee(targetSelector, items, builder) {
    const root = document.querySelector(targetSelector);
    clearNode(root);
    if (!items || items.length === 0) {
        root.appendChild(createElement("div", "empty-card", "No curated cases are available for this section."));
        return;
    }

    const track = createElement("div", "marquee-track");
    for (let duplicate = 0; duplicate < 2; duplicate += 1) {
        items.forEach((item, index) => {
            track.appendChild(builder(item, index));
        });
    }
    root.appendChild(track);

    autoPlayVideos(root);
}

function formatResultNumber(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return "";
    }
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function parseResultNumber(value) {
    const match = String(value || "").match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : null;
}

function formatDelta(delta) {
    if (typeof delta !== "number" || !Number.isFinite(delta)) {
        return "";
    }
    if (delta > 0) {
        return `+${delta.toFixed(2)}`;
    }
    return delta.toFixed(2).replace("-", "−");
}

function renderMetricValue(value, table) {
    if (table.metric_mode !== "triple" || !String(value).includes("/")) {
        return createElement("span", "metric-value", value);
    }
    const labels = ["Avg", "One", "All"];
    const wrapper = createElement("span", "metric-chip-set");
    String(value)
        .split("/")
        .map((part) => part.trim())
        .forEach((part, index) => {
            if (!part || part === "-") {
                return;
            }
            const chip = createElement("span", "metric-chip");
            chip.appendChild(createElement("small", "", labels[index] || `M${index + 1}`));
            chip.appendChild(createElement("strong", "", part));
            wrapper.appendChild(chip);
        });
    return wrapper;
}

function isDeltaImprovement(delta, column) {
    if (delta === null || Number.isNaN(delta)) {
        return false;
    }
    return column.lower_is_better ? delta < 0 : delta > 0;
}

function renderDeltaPill(delta, column) {
    const pill = createElement("span", "metric-delta");
    if (isDeltaImprovement(delta, column)) {
        pill.classList.add("is-improvement");
    }
    pill.textContent = `${formatDelta(delta)} vs base`;
    return pill;
}

function renderResultsSummary(cards) {
    const grid = createElement("div", "results-summary-grid");
    cards.forEach((card) => {
        const item = createElement("article", `results-summary-card tone-${card.tone || "blue"}`);
        item.appendChild(createElement("span", "results-summary-label", card.label));
        const metric = createElement("div", "results-summary-metric");
        metric.appendChild(createElement("strong", "", formatResultNumber(card.value)));
        metric.appendChild(createElement("small", "", card.metric));
        item.appendChild(metric);
        const copy = createElement("p", "");
        const deltaText = card.lower_is_better ? formatDelta(card.delta) : formatDelta(card.delta);
        copy.textContent = `${deltaText} ${card.reference_label}`;
        item.appendChild(copy);
        grid.appendChild(item);
    });
    return grid;
}

function renderResultsTabs(tables, activeTable) {
    const tabs = createElement("div", "results-tabs");
    tables.forEach((table) => {
        const button = createElement("button", "results-tab");
        button.type = "button";
        button.setAttribute("aria-pressed", table.id === activeTable.id ? "true" : "false");
        button.setAttribute("title", "Click to switch comparison table");
        button.appendChild(createElement("span", "results-tab-dataset", table.dataset || "Results"));
        button.appendChild(createElement("span", "results-tab-task", table.task || table.title.replace(" Retrieval", "")));
        if (table.id === activeTable.id) {
            button.classList.add("is-active");
        }
        button.addEventListener("click", () => {
            state.resultTableId = table.id;
            renderResultsShowcase();
        });
        tabs.appendChild(button);
    });
    return tabs;
}

function groupRowsByType(rows) {
    const preferredOrder = ["Supervised", "Training-Free"];
    const grouped = [];
    const usedTypes = new Set();

    preferredOrder.forEach((type) => {
        const groupRows = rows.filter((row) => row.type === type);
        if (groupRows.length > 0) {
            grouped.push({ type, rows: groupRows });
            usedTypes.add(type);
        }
    });

    rows.forEach((row) => {
        if (usedTypes.has(row.type)) {
            return;
        }
        let group = grouped.find((item) => item.type === row.type);
        if (!group) {
            group = { type: row.type || "Other", rows: [] };
            grouped.push(group);
        }
        group.rows.push(row);
    });

    return grouped;
}

function renderResultTypeRow(type, columnCount) {
    const tr = createElement("tr", "result-type-row");
    tr.classList.add(type === "Training-Free" ? "type-training-free" : "type-supervised");
    const td = createElement("td");
    td.colSpan = columnCount;
    td.appendChild(createElement("span", "result-type-label", type));
    tr.appendChild(td);
    return tr;
}

function renderResultsTable(table) {
    const panel = createElement("article", "native-results-panel");
    const header = createElement("div", "native-results-header");
    const titleWrap = createElement("div", "");
    titleWrap.appendChild(createElement("h3", "", table.title));
    titleWrap.appendChild(createElement("p", "", table.subtitle));
    header.appendChild(titleWrap);
    panel.appendChild(header);

    const baseline = table.rows.find((row) => row.role === "baseline");
    const scroller = createElement("div", "native-results-scroll");
    const tableElement = createElement("table", "native-results-table");
    const thead = createElement("thead");
    const headerRow = createElement("tr");
    headerRow.appendChild(createElement("th", "method-cell", "Method"));
    table.columns.forEach((column) => {
        const th = createElement("th");
        if (column.group) {
            th.appendChild(createElement("span", "metric-group-label", column.group));
        }
        th.appendChild(createElement("strong", "", column.label));
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    tableElement.appendChild(thead);

    const tbody = createElement("tbody");
    groupRowsByType(table.rows).forEach((group) => {
        tbody.appendChild(renderResultTypeRow(group.type, table.columns.length + 1));
        group.rows.forEach((row) => {
            const tr = createElement("tr", `result-row role-${row.role}`);
            const methodCell = createElement("td", "method-cell");
            methodCell.appendChild(createElement("strong", "", row.method));
            tr.appendChild(methodCell);
            table.columns.forEach((column) => {
                const td = createElement("td");
                const value = row.values[column.key] || "-";
                td.appendChild(renderMetricValue(value, table));
                if (row.role === "ours" && baseline) {
                    const oursValue = parseResultNumber(value);
                    const baseValue = parseResultNumber(baseline.values[column.key]);
                    if (oursValue !== null && baseValue !== null) {
                        td.appendChild(renderDeltaPill(oursValue - baseValue, column));
                    }
                }
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
    });
    tableElement.appendChild(tbody);
    scroller.appendChild(tableElement);
    panel.appendChild(scroller);
    return panel;
}

function renderResultsShowcase() {
    const root = document.querySelector("[data-role='results-showcase']");
    if (!root || !window.MOMO_RESULTS_DATA) {
        return;
    }
    clearNode(root);
    const payload = window.MOMO_RESULTS_DATA;
    const tables = payload.tables || [];
    if (tables.length === 0) {
        root.appendChild(createElement("div", "empty-card", "No result tables are available."));
        return;
    }
    const activeTable = tables.find((table) => table.id === state.resultTableId) || tables[0];
    state.resultTableId = activeTable.id;
    const shell = createElement("div", "native-results-shell");
    shell.appendChild(renderResultsSummary(payload.summary_cards || []));
    shell.appendChild(renderResultsTabs(tables, activeTable));
    shell.appendChild(renderResultsTable(activeTable));
    root.appendChild(shell);
}

function renderAll() {
    renderMarquee("[data-role='v2t-marquee']", state.data.video_to_text, buildV2TMarqueeItem);
    renderMarquee("[data-role='t2v-marquee']", state.data.text_to_video, buildT2VMarqueeItem);
    renderV2TDetail();
    renderT2VDetail();
    renderResultsShowcase();
}

function autoPlayVideos(scope) {
    scope.querySelectorAll("video[autoplay]").forEach((video) => {
        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === "function") {
            playPromise.catch(() => {});
        }
    });
}

async function loadPageData() {
    if (window.MOMO_PAGE_DATA) {
        return window.MOMO_PAGE_DATA;
    }

    const response = await fetch(DATA_URL);
    if (!response.ok) {
        throw new Error(`Failed to load ${DATA_URL}: ${response.status}`);
    }
    return response.json();
}

async function start() {
    const loadingTargets = document.querySelectorAll("[data-role='v2t-detail'], [data-role='t2v-detail']");
    loadingTargets.forEach((target) => {
        clearNode(target);
        const loading = createElement("div", "loading-card");
        loading.appendChild(createElement("p", "", "Loading curated ActivityNet examples, text trees, and video decompositions..."));
        target.appendChild(loading);
    });

    try {
        state.data = await loadPageData();
        renderAll();
    } catch (error) {
        document.querySelectorAll("[data-role='v2t-detail'], [data-role='t2v-detail']").forEach((target) => {
            clearNode(target);
            const message = createElement("div", "empty-card");
            message.appendChild(createElement("p", "", `The page data could not be loaded. ${error.message}`));
            target.appendChild(message);
        });
        console.error(error);
    }
}

document.addEventListener("DOMContentLoaded", start);

