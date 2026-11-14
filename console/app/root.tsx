import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";

// 👇 import your ThemeProvider
import { ThemeProvider } from "~/components/theme-provider";
import { SidebarProvider } from "~/components/ui/sidebar";
import { QueryProvider } from "./providers/QueryProvider";
import { Provider } from "react-redux";
import { store } from "~/redux/store";
import { Toaster } from "~/components/ui/sonner";
// import { ModeToggle } from "~/components/mode-toggle";

export const links: Route.LinksFunction = () => [
  { rel: "icon", href: "/favicon.ico?v=2", sizes: "any" },
  { rel: "icon", type: "image/png", href: "/icon.png?v=2" },
  { rel: "apple-touch-icon", href: "/apple-touch-icon.png?v=2" },
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Jost:wght@300;400;500;600&family=Manrope:wght@300;400;500;600;700&display=swap",
  },
];

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Only For Her Admin Console" },
    { name: "description", content: "Only For Her admin console" },
  ];
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <Provider store={store}>
          <QueryProvider>
            <ThemeProvider defaultTheme="light" storageKey="vite-ui-theme">
              {children}
              <Toaster position="bottom-right" />
              <ScrollRestoration />
              <Scripts />
            </ThemeProvider>
          </QueryProvider>
        </Provider>
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
