import React, { useState } from "react";
import { nativeAndroid, NativeBridge } from "./native";
export function AttachmentLink({ href, children, ...props }: any) {
  const [error, E] = useState("");
  return (
    <>
      <a
        href={href}
        {...props}
        onClick={
          nativeAndroid
            ? async (e) => {
                e.preventDefault();
                E("");
                try {
                  await NativeBridge.openAttachment({
                    path: href.replace(/^\/api/, ""),
                  });
                } catch (e) {
                  E(e.message);
                }
              }
            : undefined
        }
      >
        {children}
      </a>
      {error && <span role="alert"> {error}</span>}
    </>
  );
}
