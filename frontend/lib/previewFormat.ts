export type PreviewFormatOptions = {
    maxHeadingLevel?: number;
};

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

export function formatAgentOutputToMarkdown(output: any, options: PreviewFormatOptions = {}): string {
    const maxHeadingLevel = options.maxHeadingLevel ?? 6;

    if (output === null || output === undefined) return "";

    // If backend stores a primary markdown field, prefer it.
    if (isPlainObject(output)) {
        if (typeof output.long_form === "string" && output.long_form.trim()) return output.long_form;
        if (typeof output.markdown === "string" && output.markdown.trim()) return output.markdown;
        if (typeof output.content === "string" && output.content.trim()) return output.content;

        if (
            Object.keys(output).length === 1 &&
            typeof output.raw_output === "string" &&
            output.raw_output.trim()
        ) {
            return output.raw_output;
        }
    }

    return valueToMarkdown(output, 1, maxHeadingLevel).trim();
}
