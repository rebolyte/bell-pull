import type { PluginInfo } from "../types/shared.ts";

type SidebarProps = {
  plugins: PluginInfo[];
  currentPath: string;
};

export const Sidebar = ({ plugins, currentPath }: SidebarProps) => (
  <aside class="sidebar">
    <SidebarSection title="Settings">
      <NavLink href="/dashboard/general" currentPath={currentPath}>
        General
      </NavLink>
      <NavLink href="/dashboard/memories" currentPath={currentPath}>
        Memories
      </NavLink>
      <NavLink href="/dashboard/messages" currentPath={currentPath}>
        Messages
      </NavLink>
    </SidebarSection>

    <SidebarSection title="Plugins">
      {plugins.map((plugin) => (
        <NavLink
          href={`/dashboard/plugins/${plugin.name}`}
          currentPath={currentPath}
          disabled={!plugin.enabled}
        >
          {plugin.displayName}
        </NavLink>
      ))}
    </SidebarSection>
  </aside>
);

// deno-lint-ignore no-explicit-any
const SidebarSection = (props: { title: string; children: any }) => (
  <div class="sidebar-section">
    <h3 class="sidebar-section-title">{props.title}</h3>
    <nav class="sidebar-nav">{props.children}</nav>
  </div>
);

type NavLinkProps = {
  href: string;
  currentPath: string;
  disabled?: boolean;
  // deno-lint-ignore no-explicit-any
  children: any;
};

const NavLink = ({ href, currentPath, disabled, children }: NavLinkProps) => {
  const isActive = currentPath === href;
  const classes = [
    "nav-item",
    isActive && "nav-item-active",
    disabled && "nav-item-disabled",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <a href={href} class={classes}>
      {children}
    </a>
  );
};
