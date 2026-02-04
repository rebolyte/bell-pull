import type { PluginInfo } from "../../types/shared.ts";
import { Sidebar } from "./nav.tsx";

type LayoutProps = {
  title: string;
  // deno-lint-ignore no-explicit-any
  children?: any;
};

export const Layout = (props: LayoutProps) => (
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>{props.title}</title>
      <link
        rel="icon"
        href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22 fill=%22%23007d9c%22>🛎️</text></svg>"
      />
      <link rel="stylesheet" href="/static/styles/main.css" />
      <script src="https://unpkg.com/htmx.org@2.0.4" defer />
    </head>
    <body hx-boost="true" hx-swap="innerHTML show:body:top">
      {props.children}
    </body>
  </html>
);

type DashboardShellProps = {
  plugins: PluginInfo[];
  currentPath: string;
  // deno-lint-ignore no-explicit-any
  children?: any;
};

export const DashboardShell = ({
  plugins,
  currentPath,
  children,
}: DashboardShellProps) => (
  <div class="dashboard-layout">
    <Sidebar plugins={plugins} currentPath={currentPath} />
    <main class="content-area">{children}</main>
  </div>
);
