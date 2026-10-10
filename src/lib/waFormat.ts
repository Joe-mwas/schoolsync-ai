export type WaSegment = { text: string; style: "plain" | "bold" | "italic" };

/** Split WhatsApp-formatted text into plain, *bold* and _italic_ pieces. */
export function waSegments(text: string): WaSegment[] {
  return text
    .split(/(\*[^*\n]+\*|_[^_\n]+_)/g)
    .filter((p) => p !== "")
    .map((p) =>
      /^\*[^*\n]+\*$/.test(p)
        ? { text: p.slice(1, -1), style: "bold" as const }
        : /^_[^_\n]+_$/.test(p)
          ? { text: p.slice(1, -1), style: "italic" as const }
          : { text: p, style: "plain" as const },
    );
}
