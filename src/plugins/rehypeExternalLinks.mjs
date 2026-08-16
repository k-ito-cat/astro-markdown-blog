const EXTERNAL_LINK_ICON_PATH =
  "M3.75 2h3.5a.75.75 0 0 1 0 1.5h-3.5a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-3.5a.75.75 0 0 1 1.5 0v3.5A1.75 1.75 0 0 1 12.25 14h-8.5A1.75 1.75 0 0 1 2 12.25v-8.5C2 2.784 2.784 2 3.75 2m6.854-1h4.146a.25.25 0 0 1 .25.25v4.146a.25.25 0 0 1-.427.177L13.03 4.03 9.28 7.78a.75.75 0 0 1-1.042-.018.75.75 0 0 1-.018-1.042l3.75-3.75-1.543-1.543A.25.25 0 0 1 10.604 1";

const EXTERNAL_LINK_ICON_MARKUP = `<svg class="external-link-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path fill="currentColor" d="${EXTERNAL_LINK_ICON_PATH}"></path></svg>`;

const asList = (value) => {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") return value.split(/\s+/).filter(Boolean);
  return [];
};

const hasClass = (node, className) =>
  asList(node.properties?.className).includes(className);

const findDescendant = (node, predicate) => {
  for (const child of node.children ?? []) {
    if (child.type !== "element") continue;
    if (predicate(child)) return child;

    const descendant = findDescendant(child, predicate);
    if (descendant) return descendant;
  }

  return undefined;
};

const createExternalLinkIcon = () => ({
  type: "element",
  tagName: "svg",
  properties: {
    className: ["external-link-icon"],
    viewBox: "0 0 16 16",
    width: 16,
    height: 16,
    ariaHidden: "true",
    focusable: "false",
  },
  children: [
    {
      type: "element",
      tagName: "path",
      properties: {
        fill: "currentColor",
        d: EXTERNAL_LINK_ICON_PATH,
      },
      children: [],
    },
  ],
});

const appendIcon = (link) => {
  if (findDescendant(link, (node) => hasClass(node, "external-link-icon"))) {
    return;
  }

  const linkCardMeta = findDescendant(link, (node) =>
    hasClass(node, "remark-link-card-plus__meta"),
  );
  (linkCardMeta ?? link).children.push(createExternalLinkIcon());
};

const isExternalHttpUrl = (href, internalHosts) => {
  let url;
  try {
    url = new URL(href);
  } catch {
    return false;
  }

  return (
    ["http:", "https:"].includes(url.protocol) &&
    !internalHosts.has(url.hostname.toLowerCase())
  );
};

const updateLink = (link, internalHosts, descriptionId) => {
  const properties = link.properties ?? {};
  const href = properties.href;
  if (typeof href !== "string" || Object.hasOwn(properties, "download")) {
    return;
  }

  if (!isExternalHttpUrl(href, internalHosts)) return;

  const target = properties.target;
  if (typeof target === "string" && target !== "_blank") return;

  const classNames = new Set(asList(properties.className));
  classNames.add("external-link");
  properties.className = [...classNames];
  properties.target = "_blank";

  const rel = new Set(asList(properties.rel));
  rel.add("noopener");
  properties.rel = [...rel];

  const describedBy = new Set(asList(properties.ariaDescribedBy));
  describedBy.add(descriptionId);
  properties.ariaDescribedBy = [...describedBy].join(" ");
  link.properties = properties;

  appendIcon(link);
};

const addAttributeToken = (tag, attributeName, token) => {
  const attributePattern = new RegExp(
    `\\s${attributeName}=(['"])(.*?)\\1`,
    "i",
  );
  const match = tag.match(attributePattern);

  if (match) {
    const tokens = new Set(asList(match[2]));
    tokens.add(token);
    return tag.replace(
      attributePattern,
      ` ${attributeName}=${match[1]}${[...tokens].join(" ")}${match[1]}`,
    );
  }

  return tag.replace(/>$/, ` ${attributeName}="${token}">`);
};

const transformRawAnchor = (anchorMarkup, internalHosts, descriptionId) => {
  const startTag = anchorMarkup.match(/^<a\b[^>]*>/i)?.[0];
  if (!startTag || /\sdownload(?:\s|=|>)/i.test(startTag)) return anchorMarkup;

  const href = startTag.match(/\shref=(['"])(.*?)\1/i)?.[2];
  if (!href || !isExternalHttpUrl(href, internalHosts)) return anchorMarkup;

  const target = startTag.match(/\starget=(['"])(.*?)\1/i)?.[2];
  if (target && target !== "_blank") return anchorMarkup;

  let transformedTag = startTag;
  if (!target)
    transformedTag = transformedTag.replace(/>$/, ' target="_blank">');
  transformedTag = addAttributeToken(transformedTag, "rel", "noopener");
  transformedTag = addAttributeToken(
    transformedTag,
    "aria-describedby",
    descriptionId,
  );
  transformedTag = addAttributeToken(transformedTag, "class", "external-link");

  let transformedMarkup = anchorMarkup.replace(startTag, transformedTag);
  if (transformedMarkup.includes("external-link-icon"))
    return transformedMarkup;

  if (transformedTag.includes("remark-link-card-plus__card")) {
    return transformedMarkup.replace(
      /(<div class="remark-link-card-plus__meta">[\s\S]*?)(\s*<\/div>)/,
      `$1\n    ${EXTERNAL_LINK_ICON_MARKUP}$2`,
    );
  }

  return transformedMarkup.replace(
    /<\/a>\s*$/i,
    `${EXTERNAL_LINK_ICON_MARKUP}</a>`,
  );
};

export function remarkExternalLinksInHtml({
  internalHosts = [],
  descriptionId = "external-link-new-tab",
} = {}) {
  const normalizedInternalHosts = new Set(
    internalHosts.map((hostname) => hostname.toLowerCase()),
  );

  return (tree) => {
    const visit = (node) => {
      if (node.type === "html" && !node.value.includes('class="codepen"')) {
        node.value = node.value.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, (anchor) =>
          transformRawAnchor(anchor, normalizedInternalHosts, descriptionId),
        );
      }

      for (const child of node.children ?? []) visit(child);
    };

    visit(tree);
  };
}

export default function rehypeExternalLinks({
  internalHosts = [],
  descriptionId = "external-link-new-tab",
} = {}) {
  const normalizedInternalHosts = new Set(
    internalHosts.map((hostname) => hostname.toLowerCase()),
  );

  return (tree) => {
    const visit = (node) => {
      if (node.type === "element" && node.tagName === "a") {
        updateLink(node, normalizedInternalHosts, descriptionId);
      }

      for (const child of node.children ?? []) visit(child);
    };

    visit(tree);
  };
}
