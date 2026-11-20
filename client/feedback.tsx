import React from "react";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
export function FeedbackSnackbar({
  message,
  severity = "success",
  onClose,
}: any) {
  return (
    <Snackbar
      key={message}
      open={!!message}
      autoHideDuration={5000}
      disableWindowBlurListener
      anchorOrigin={{ vertical: "top", horizontal: "right" }}
      onClose={(_, reason) => {
        if (reason !== "clickaway") onClose();
      }}
      sx={{ zIndex: 1600 }}
    >
      <Alert
        severity={severity}
        variant="filled"
        onClose={onClose}
        sx={{ width: "100%" }}
      >
        {message}
      </Alert>
    </Snackbar>
  );
}
