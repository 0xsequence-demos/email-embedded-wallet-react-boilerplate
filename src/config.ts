import { SequenceWaaS } from "@0xsequence/waas";
import { createConfig } from "@0xsequence/connect";

export const projectAccessKey = import.meta.env.VITE_PROJECT_ACCESS_KEY;
export const waasConfigKey = import.meta.env.VITE_WAAS_CONFIG_KEY;

export const sequence = new SequenceWaaS({
  projectAccessKey: projectAccessKey,
  waasConfigKey: waasConfigKey,
  network: "polygon",
});

export const config: any = createConfig("waas", {
  projectAccessKey: projectAccessKey,
  chainIds: [1, 137],
  defaultChainId: 1,
  appName: "Demo Dapp",
  waasConfigKey: waasConfigKey,
});
