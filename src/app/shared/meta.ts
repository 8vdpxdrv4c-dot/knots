import type { MetaDescriptor } from "react-router";
import type { KnotDef } from "../../engine/knots/types";
import { imageAltFor, siteNameFor } from "./copy";
import { absoluteUrl, knotImagePath, knotPath } from "./site";

/** Title, description, canonical link and share preview (Open Graph, Twitter) for a knot's page. */
export function knotMeta(knot: KnotDef): MetaDescriptor[] {
  const siteName = siteNameFor(knot.id);
  const title = `${knot.name} · ${siteName}`;
  const url = absoluteUrl(knotPath(knot.id));
  const image = absoluteUrl(knotImagePath(knot.id));
  return [
    { title },
    { name: "description", content: knot.summary },
    { tagName: "link", rel: "canonical", href: url },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: siteName },
    { property: "og:title", content: title },
    { property: "og:description", content: knot.summary },
    { property: "og:url", content: url },
    { property: "og:image", content: image },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { property: "og:image:alt", content: imageAltFor(knot) },
    { name: "twitter:card", content: "summary_large_image" },
  ];
}
