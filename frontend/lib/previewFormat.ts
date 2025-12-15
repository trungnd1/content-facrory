export type PreviewFormatOptions = {
    maxHeadingLevel?: number;
    // Per-agent/per-run display ordering and titles.
    // Expected shape (preferred for deterministic ordering):
    //   [{ key_a: "Title A" }, { nested.key_b: "Title B" }]
    // We also accept a plain object map, but object key order is not reliable.
    previewTitleMap?: Array<Record<string, string>> | Record<string, string>;
};

type PreviewTitleMap = Array<Record<string, string>> | Record<string, string>;

type PreviewOrdering = {
    titleByPath: Record<string, string>;
    orderByParent: Record<string, string[]>;
};

function normalizePreviewPath(path: string): string {
    // Supports explicit array-item marker syntax in preview_title_map entries:
    //   insights[].what -> insights.what
    // We only strip the literal "[]" marker; we do NOT alter numeric indices like [0].
    return path.replace(/\[\]/g, "");
}

function buildPreviewOrdering(previewTitleMap?: PreviewTitleMap): PreviewOrdering {
    const titleByPath: Record<string, string> = {};
    const orderByParent: Record<string, string[]> = {};

    if (!previewTitleMap) return { titleByPath, orderByParent };

    const pushKey = (parentPath: string, key: string) => {
        if (!orderByParent[parentPath]) orderByParent[parentPath] = [];
        if (!orderByParent[parentPath].includes(key)) orderByParent[parentPath].push(key);
    };

    const addEntry = (path: string, title: string) => {
        if (!path || typeof path !== "string") return;

        const normalizedPath = normalizePreviewPath(path);
        if (typeof title === "string" && title.trim()) titleByPath[normalizedPath] = title;

        const parts = normalizedPath.split(".").filter(Boolean);
        if (parts.length === 0) return;
        const key = parts[parts.length - 1];
        const parentPath = parts.slice(0, -1).join(".");
        pushKey(parentPath, key);
    };

    // Preferred: array of single-key objects to preserve explicit ordering.
    if (Array.isArray(previewTitleMap)) {
        for (const item of previewTitleMap) {
            if (!item || typeof item !== "object" || Array.isArray(item)) continue;
            for (const [path, title] of Object.entries(item)) {
                addEntry(path, String(title));
            }
        }
        return { titleByPath, orderByParent };
    }

    // Fallback: object map (ordering not guaranteed by JS spec across all sources)
    if (previewTitleMap && typeof previewTitleMap === "object") {
        for (const [path, title] of Object.entries(previewTitleMap)) {
            addEntry(path, String(title));
        }
    }

    return { titleByPath, orderByParent };
}

function compareObjectKeys(a: string, b: string): number {
    const ma = a.match(/^(.+?)_(\d+)$/);
    const mb = b.match(/^(.+?)_(\d+)$/);
    if (ma && mb && ma[1] === mb[1]) return Number(ma[2]) - Number(mb[2]);
    return a.localeCompare(b);
}

function getTitleForPathKey(parentPath: string, key: string, ordering: PreviewOrdering): string {
    const keyPath = parentPath ? `${parentPath}.${key}` : key;
    return ordering.titleByPath[keyPath] ?? formatTitle(key);
}

function getOrderedObjectEntries(
    obj: Record<string, any>,
    parentPath: string,
    ordering: PreviewOrdering,
): Array<[string, any]> {
    const entries = Object.entries(obj).filter(([, v]) => v !== null && v !== undefined);
    const keys = entries.map(([k]) => k);

    const preferred = ordering.orderByParent[parentPath] ?? [];
    const preferredSet = new Set(preferred);
    const keySet = new Set(keys);

    const orderedKeys: string[] = [];
    for (const k of preferred) {
        if (keySet.has(k)) orderedKeys.push(k);
    }

    const restKeys = keys.filter((k) => !preferredSet.has(k)).sort(compareObjectKeys);
    orderedKeys.push(...restKeys);

    const valueByKey = new Map(entries);
    return orderedKeys.map((k) => [k, valueByKey.get(k)] as [string, any]);
}

function normalizeMultilineText(text: string): string {
    // Convert common escaped newlines ("\\n") into real line breaks,
    // and normalize Windows line endings.
    return text
        .replace(/\\r\\n/g, "\n")
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\n")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");
}

function extractJsonStringField(jsonLike: string, fieldName: string): string | null {
    // Best-effort extraction of a quoted JSON string field value even if the overall
    // payload isn't strict JSON (e.g., raw newlines inside the string).
    const s = jsonLike;
    const key = `"${fieldName}"`;
    const idx = s.indexOf(key);
    if (idx === -1) return null;

    // Find ':' after the key
    let i = idx + key.length;
    while (i < s.length && s[i] !== ":") i += 1;
    if (i >= s.length || s[i] !== ":") return null;
    i += 1;

    // Skip whitespace
    while (i < s.length && /\s/.test(s[i])) i += 1;
    if (i >= s.length || s[i] !== '"') return null;
    i += 1;

    let out = "";
    while (i < s.length) {
        const ch = s[i];

        if (ch === "\\") {
            // Keep escape sequence as-is, then unescape later.
            if (i + 1 < s.length) {
                out += ch + s[i + 1];
                i += 2;
                continue;
            }
            out += ch;
            i += 1;
            continue;
        }

        if (ch === '"') {
            // In strict JSON, this ends the string. In "JSON-ish" payloads coming from
            // LLMs, unescaped quotes sometimes appear inside the value. Heuristic:
            // treat it as a terminator only if the next non-whitespace looks like a
            // JSON structural token.
            let j = i + 1;
            while (j < s.length && /\s/.test(s[j])) j += 1;
            const next = j < s.length ? s[j] : "";
            if (next === "}" || next === "]") {
                break;
            }
            if (next === ",") {
                // Avoid truncating when quotes are used as punctuation inside the value
                // (e.g. "...", next sentence). Only treat as a terminator if the comma
                // is followed by what looks like the next JSON key.
                let k = j + 1;
                while (k < s.length && /\s/.test(s[k])) k += 1;
                if (k < s.length && s[k] === '"') {
                    break;
                }
            }
            out += '"';
            i += 1;
            continue;
        }

        out += ch;
        i += 1;
    }

    try {
        // Decode common JSON escapes by wrapping into a JSON string.
        const decoded = JSON.parse(`"${out.replace(/"/g, "\\\"")}"`);
        return typeof decoded === "string" ? normalizeMultilineText(decoded) : decoded;
    } catch {
        // Fallback: best-effort unescape of common sequences.
        const unescaped = out
            .replace(/\\\\/g, "\\")
            .replace(/\\"/g, '"')
            .replace(/\\n/g, "\n")
            .replace(/\\r/g, "\n")
            .replace(/\\t/g, "\t");
        return normalizeMultilineText(unescaped);
    }
}

function extractPreferredPayloadFromJsonLike(jsonLike: string): any | null {
    // Special-case long_form: return a structured object so Preview renders a "Long Form" header.
    const longForm = extractJsonStringField(jsonLike, "long_form");
    if (typeof longForm === "string" && longForm.trim()) {
        const topicId = extractJsonStringField(jsonLike, "topic_id");
        const out: Record<string, any> = { long_form: longForm };
        if (typeof topicId === "string") out.topic_id = topicId;
        return out;
    }

    // For plain markdown/content outputs, return the string as-is.
    const markdown = extractJsonStringField(jsonLike, "markdown");
    if (typeof markdown === "string" && markdown.trim()) return markdown;

    const content = extractJsonStringField(jsonLike, "content");
    if (typeof content === "string" && content.trim()) return content;

    const raw = extractJsonStringField(jsonLike, "raw_output");
    if (typeof raw === "string" && raw.trim()) return raw;

    return null;
}

function tryParseLooseJson(text: string): any | null {
    if (!text) return null;

    const trimmed = text.trim();

    // Strip markdown fences like ```json ... ```
    const withoutFences = trimmed.replace(/```[a-zA-Z]*\s*([\s\S]*?)```/g, "$1").trim();

    // Remove JS-style comments (sometimes present in prompt/model outputs)
    const withoutComments = withoutFences
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");

    // Remove trailing commas before } or ] (JSON5-ish)
    const normalized = withoutComments.replace(/,\s*([}\]])/g, "$1").trim();

    // If it isn't valid JSON but clearly contains a primary payload,
    // extract that (common with long-form outputs that contain raw newlines).
    const extracted = extractPreferredPayloadFromJsonLike(normalized);
    if (extracted) return extracted;

    // Quick guard: only attempt parse if it looks like JSON
    const first = normalized[0];
    if (first !== "{" && first !== "[" && first !== '"') return null;

    try {
        return JSON.parse(normalized);
    } catch {
        return null;
    }
}

function coerceOutputToJsonIfString(output: any): any {
    if (typeof output !== "string") return output;

    const parsed = tryParseLooseJson(output);
    if (parsed !== null && parsed !== undefined) return parsed;

    return output;
}

function formatTitle(key: string): string {
    return key
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/_/g, " ")
        .split(" ")
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
}

function sortObjectKeys(value: any): any {
    if (Array.isArray(value)) return value.map(sortObjectKeys);
    if (!value || typeof value !== "object") return value;

    const entries = Object.entries(value as Record<string, any>);

    entries.sort(([a], [b]) => {
        const ma = a.match(/^(.+?)_(\d+)$/);
        const mb = b.match(/^(.+?)_(\d+)$/);
        if (ma && mb && ma[1] === mb[1]) return Number(ma[2]) - Number(mb[2]);
        return a.localeCompare(b);
    });

    const out: Record<string, any> = {};
    for (const [k, v] of entries) out[k] = sortObjectKeys(v);
    return out;
}

function isPlainObject(v: any): v is Record<string, any> {
    return !!v && typeof v === "object" && !Array.isArray(v);
}

function bulletsFromObject(obj: Record<string, any>, level: number, maxHeadingLevel: number): string {
    const indent = "  ".repeat(Math.max(0, level - 1));
    const sorted = sortObjectKeys(obj);
    const entries = Object.entries(sorted).filter(([, v]) => v !== null && v !== undefined);

    return entries
        .map(([key, value]) => {
            const title = formatTitle(key);

            if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
                const text = typeof value === "string" ? value.trim() : String(value);
                if (!text) return "";
                return `${indent}- **${title}**: ${text}`;
            }

            if (Array.isArray(value)) {
                const nested = bulletsFromArray(value, level + 1, maxHeadingLevel);
                return nested.trim() ? `${indent}- **${title}**:\n${nested}` : "";
            }

            if (isPlainObject(value)) {
                const nested = bulletsFromObject(value, level + 1, maxHeadingLevel);
                return nested.trim() ? `${indent}- **${title}**:\n${nested}` : "";
            }

            const fallback = String(value);
            return fallback.trim() ? `${indent}- **${title}**: ${fallback}` : "";
        })
        .filter(Boolean)
        .join("\n");
}

function bulletsFromObjectWithOrdering(
    obj: Record<string, any>,
    level: number,
    maxHeadingLevel: number,
    parentPath: string,
    ordering: PreviewOrdering,
): string {
    const indent = "  ".repeat(Math.max(0, level - 1));
    const entries = getOrderedObjectEntries(obj, parentPath, ordering);

    return entries
        .map(([key, value]) => {
            const title = getTitleForPathKey(parentPath, key, ordering);
            const childPath = parentPath ? `${parentPath}.${key}` : key;

            if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
                const text = typeof value === "string" ? value.trim() : String(value);
                if (!text) return "";
                return `${indent}- **${title}**: ${text}`;
            }

            if (Array.isArray(value)) {
                const nested = bulletsFromArrayWithOrdering(value, level + 1, maxHeadingLevel, childPath, ordering);
                return nested.trim() ? `${indent}- **${title}**:\n${nested}` : "";
            }

            if (isPlainObject(value)) {
                const nested = bulletsFromObjectWithOrdering(value, level + 1, maxHeadingLevel, childPath, ordering);
                return nested.trim() ? `${indent}- **${title}**:\n${nested}` : "";
            }

            const fallback = String(value);
            return fallback.trim() ? `${indent}- **${title}**: ${fallback}` : "";
        })
        .filter(Boolean)
        .join("\n");
}

function bulletsFromArray(arr: any[], level: number, maxHeadingLevel: number): string {
    const indent = "  ".repeat(Math.max(0, level - 1));

    return arr
        .map((item, index) => {
            if (item === null || item === undefined) return `${indent}-`;

            if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
                return `${indent}- ${item}`;
            }

            if (Array.isArray(item)) {
                const nested = bulletsFromArray(item, level + 1, maxHeadingLevel);
                return `${indent}-\n${nested}`;
            }

            if (isPlainObject(item)) {
                const obj = sortObjectKeys(item);
                const title =
                    (typeof obj.title === "string" && obj.title.trim())
                        ? obj.title.trim()
                        : (typeof obj.name === "string" && obj.name.trim())
                            ? obj.name.trim()
                            : (typeof obj.topic === "string" && obj.topic.trim())
                                ? obj.topic.trim()
                                : (typeof obj.id === "string" && obj.id.trim())
                                    ? obj.id.trim()
                                    : `Item ${index + 1}`;

                const nested = bulletsFromObject(obj, level + 1, maxHeadingLevel);
                return nested.trim() ? `${indent}- **${title}**\n${nested}` : `${indent}- **${title}**`;
            }

            return `${indent}- \`\`\`${String(item)}\`\`\``;
        })
        .join("\n");
}

function bulletsFromArrayWithOrdering(
    arr: any[],
    level: number,
    maxHeadingLevel: number,
    parentPath: string,
    ordering: PreviewOrdering,
): string {
    const indent = "  ".repeat(Math.max(0, level - 1));

    return arr
        .map((item, index) => {
            if (item === null || item === undefined) return `${indent}-`;

            if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
                return `${indent}- ${item}`;
            }

            if (Array.isArray(item)) {
                const nested = bulletsFromArrayWithOrdering(item, level + 1, maxHeadingLevel, parentPath, ordering);
                return `${indent}-\n${nested}`;
            }

            if (isPlainObject(item)) {
                const obj = item as Record<string, any>;
                const title =
                    (typeof obj.title === "string" && obj.title.trim())
                        ? obj.title.trim()
                        : (typeof obj.name === "string" && obj.name.trim())
                            ? obj.name.trim()
                            : (typeof obj.topic === "string" && obj.topic.trim())
                                ? obj.topic.trim()
                                : (typeof obj.id === "string" && obj.id.trim())
                                    ? obj.id.trim()
                                    : `Item ${index + 1}`;

                const nested = bulletsFromObjectWithOrdering(obj, level + 1, maxHeadingLevel, parentPath, ordering);
                return nested.trim() ? `${indent}- **${title}**\n${nested}` : `${indent}- **${title}**`;
            }

            return `${indent}- \`\`\`${String(item)}\`\`\``;
        })
        .join("\n");
}

function valueToMarkdown(value: any, level: number, maxHeadingLevel: number): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);

    if (Array.isArray(value)) {
        if (value.length === 0) return "";

        // Always render arrays as bullet lists (arrays of objects included)
        // so the Preview renders cleanly in Tiptap StarterKit.
        return bulletsFromArray(value, level, maxHeadingLevel);
    }

    if (isPlainObject(value)) {
        const obj = sortObjectKeys(value);
        const entries = Object.entries(obj).filter(([, v]) => v !== null && v !== undefined);
        if (entries.length === 0) return "";

        const blocks: string[] = [];
        for (const [k, v] of entries) {
            const title = formatTitle(k);
            const headingLevel = Math.min(level, maxHeadingLevel);

            // When nesting gets deep, switch to bold labels instead of headers.
            const header = headingLevel >= 1 && headingLevel <= 6 ? `${"#".repeat(headingLevel)} ${title}` : `**${title}**`;

            const rendered = valueToMarkdown(v, level + 1, maxHeadingLevel);
            if (typeof v === "string" && v.trim()) {
                blocks.push(`${header}\n\n${v}`);
            } else if (rendered.trim()) {
                blocks.push(`${header}\n\n${rendered}`);
            } else {
                blocks.push(`${header}\n\n\`\`\`json\n${JSON.stringify(v, null, 2)}\n\`\`\``);
            }
        }

        return blocks.join("\n\n");
    }

    return String(value);
}

function valueToMarkdownWithOrdering(
    value: any,
    level: number,
    maxHeadingLevel: number,
    parentPath: string,
    ordering: PreviewOrdering,
): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);

    if (Array.isArray(value)) {
        if (value.length === 0) return "";
        return bulletsFromArrayWithOrdering(value, level, maxHeadingLevel, parentPath, ordering);
    }

    if (isPlainObject(value)) {
        const obj = value as Record<string, any>;
        const entries = getOrderedObjectEntries(obj, parentPath, ordering);
        if (entries.length === 0) return "";

        const blocks: string[] = [];
        for (const [k, v] of entries) {
            const title = getTitleForPathKey(parentPath, k, ordering);
            const headingLevel = Math.min(level, maxHeadingLevel);
            const header =
                headingLevel >= 1 && headingLevel <= 6
                    ? `${"#".repeat(headingLevel)} ${title}`
                    : `**${title}**`;

            const childPath = parentPath ? `${parentPath}.${k}` : k;
            const rendered = valueToMarkdownWithOrdering(v, level + 1, maxHeadingLevel, childPath, ordering);

            if (typeof v === "string" && v.trim()) {
                blocks.push(`${header}\n\n${v}`);
            } else if (rendered.trim()) {
                blocks.push(`${header}\n\n${rendered}`);
            } else {
                blocks.push(`${header}\n\n\`\`\`json\n${JSON.stringify(v, null, 2)}\n\`\`\``);
            }
        }

        return blocks.join("\n\n");
    }

    return String(value);
}

export function formatAgentOutputToMarkdown(output: any, options: PreviewFormatOptions = {}): string {
    const maxHeadingLevel = options.maxHeadingLevel ?? 6;
    const ordering = buildPreviewOrdering(options.previewTitleMap);

    if (output === null || output === undefined) return "";

    // Some execution outputs arrive as a JSON string (e.g. "{\"topic_id\": null, ...}")
    // due to imperfect LLM JSON emission or backend rescue behavior.
    // Parse it so the Preview renders like other agents.
    output = coerceOutputToJsonIfString(output);

    // Another common backend rescue shape is: { raw_output: "{...json...}" }.
    // Parse the nested JSON string if possible and render the structured object.
    if (isPlainObject(output) && typeof output.raw_output === "string") {
        const parsedInner = tryParseLooseJson(output.raw_output);
        if (parsedInner !== null && parsedInner !== undefined) {
            output = parsedInner;
        } else {
            // Even if we can't parse JSON, try to extract long-form text.
            const extracted = extractPreferredPayloadFromJsonLike(output.raw_output);
            if (extracted) output = extracted;
        }
    }

    // If backend stores a primary markdown field, prefer it.
    if (isPlainObject(output)) {
        if (typeof output.long_form === "string" && output.long_form.trim()) {
            // Render with a heading ("Long Form") and preserve paragraph breaks.
            const normalized = normalizeMultilineText(output.long_form);
            return valueToMarkdownWithOrdering({ long_form: normalized }, 1, maxHeadingLevel, "", ordering).trim();
        }
        if (typeof output.markdown === "string" && output.markdown.trim()) return output.markdown;
        if (typeof output.content === "string" && output.content.trim()) return output.content;

        if (
            Object.keys(output).length === 1 &&
            typeof output.raw_output === "string" &&
            output.raw_output.trim()
        ) {
            // If it's JSON, prefer rendering it as structured content.
            const parsedInner = tryParseLooseJson(output.raw_output);
            if (parsedInner !== null && parsedInner !== undefined) {
                return valueToMarkdownWithOrdering(parsedInner, 1, maxHeadingLevel, "", ordering).trim();
            }
            return output.raw_output;
        }
    }

    return valueToMarkdownWithOrdering(output, 1, maxHeadingLevel, "", ordering).trim();
}
