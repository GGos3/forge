import type { SshProfile, GroupNode } from "../types/connection";

export function buildGroupTree(profiles: SshProfile[]): GroupNode {
  const root: GroupNode = { name: "", fullPath: "", children: [], profiles: [] };

  for (const profile of profiles) {
    const groupPath = profile.group?.trim() || "";

    if (!groupPath) {
      root.profiles.push(profile);
      continue;
    }

    const segments = groupPath.split("/").filter(Boolean);
    let current = root;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const fullPath = segments.slice(0, i + 1).join("/");
      let child = current.children.find((c) => c.name === segment);

      if (!child) {
        child = { name: segment, fullPath, children: [], profiles: [] };
        current.children.push(child);
      }

      current = child;
    }

    current.profiles.push(profile);
  }

  sortGroupNode(root);
  return root;
}

function sortGroupNode(node: GroupNode): void {
  node.children.sort((a, b) => a.name.localeCompare(b.name));
  node.profiles.sort((a, b) => a.name.localeCompare(b.name));
  for (const child of node.children) {
    sortGroupNode(child);
  }
}
