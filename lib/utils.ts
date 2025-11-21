import Exa from "exa-js";

let exaInstance: Exa | null = null;

export const getExa = () => {
  if (!exaInstance && process.env.EXA_API_KEY) {
    exaInstance = new Exa(process.env.EXA_API_KEY);
  }
  return exaInstance;
};

export const exa = getExa();