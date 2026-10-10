import { waSegments } from "@/lib/waFormat";

/** Show WhatsApp-formatted text on the website, keeping line breaks. */
export default function WaText({ text }: { text: string }) {
  return (
    <>
      {waSegments(text).map((s, i) =>
        s.style === "bold" ? <strong key={i}>{s.text}</strong> : s.style === "italic" ? <em key={i}>{s.text}</em> : s.text,
      )}
    </>
  );
}
