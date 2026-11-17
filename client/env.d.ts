/// <reference types="vite/client" />
declare const google: {
  accounts: {
    id: {
      initialize: (config: unknown) => void;
      renderButton: (element: HTMLElement, config: unknown) => void;
    };
  };
};
