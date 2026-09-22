/**
 * 同じページの見出しを指すリンクに、鎖の印を添える。
 *
 * 外部リンクは新しいタブの矢印で「外へ出る」と分かるが、`#見出し` とサイト内の
 * 別ページは見た目が同じで、押すまで読んでいる場所を離れるか分からない。
 * 飛び先の見出しがあるときだけ印を付けるので、綴りの間違いにも気づける。
 */
const LINK_PATH =
  "m7.775 3.275l1.25-1.25a3.5 3.5 0 1 1 4.95 4.95l-2.5 2.5a3.5 3.5 0 0 1-4.95 0a.75.75 0 0 1 .018-1.042a.75.75 0 0 1 1.042-.018a2 2 0 0 0 2.83 0l2.5-2.5a2.002 2.002 0 0 0-2.83-2.83l-1.25 1.25a.75.75 0 0 1-1.042-.018a.75.75 0 0 1-.018-1.042m-4.69 9.64a2 2 0 0 0 2.83 0l1.25-1.25a.75.75 0 0 1 1.042.018a.75.75 0 0 1 .018 1.042l-1.25 1.25a3.5 3.5 0 1 1-4.95-4.95l2.5-2.5a3.5 3.5 0 0 1 4.95 0a.75.75 0 0 1-.018 1.042a.75.75 0 0 1-1.042.018a2 2 0 0 0-2.83 0l-2.5 2.5a2 2 0 0 0 0 2.83";

const HEADINGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

const asList = (value) => {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") return value.split(/\s+/).filter(Boolean);
  return [];
};

const createIcon = () => ({
  type: "element",
  tagName: "svg",
  properties: {
    className: ["in-page-link-icon"],
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
      properties: { fill: "currentColor", d: LINK_PATH },
      children: [],
    },
  ],
});

/** 見出しの id を集めてから、それを指すリンクに印を付ける */
const collect = (node, found = { headings: new Set(), links: [] }) => {
  for (const child of node.children ?? []) {
    if (child.type !== "element") continue;

    if (HEADINGS.has(child.tagName)) {
      const id = child.properties?.id;
      if (typeof id === "string") found.headings.add(id);
    }
    if (child.tagName === "a") {
      const href = child.properties?.href;
      if (typeof href === "string" && href.startsWith("#") && href.length > 1) {
        found.links.push({
          node: child,
          id: decodeURIComponent(href.slice(1)),
        });
      }
    }

    collect(child, found);
  }
  return found;
};

export default function rehypeInPageLink() {
  return (tree) => {
    const { headings, links } = collect(tree);

    for (const link of links) {
      if (!headings.has(link.id)) continue;

      const properties = link.node.properties ?? {};
      const classNames = new Set(asList(properties.className));
      classNames.add("in-page-link");
      properties.className = [...classNames];
      link.node.properties = properties;

      link.node.children.push(createIcon());
    }
  };
}
