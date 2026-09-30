import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { getPublicClient } from "wagmi/actions";
import { App } from "./App";
import { wagmiConfig } from "./config";
import { store } from "./store";
import "./styles.css";

const queryClient = new QueryClient();
store.start(getPublicClient(wagmiConfig)!);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
);
