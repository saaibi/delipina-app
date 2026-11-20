import React, { useRef, useState } from "react";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import IconButton from "@mui/material/IconButton";
import CameraAltOutlined from "@mui/icons-material/CameraAltOutlined";
export function PhotoInput({
  label,
  onFile,
  required = true,
  disabled = false,
}: any) {
  const camera = useRef<HTMLInputElement>(null),
    gallery = useRef<HTMLInputElement>(null),
    [name, N] = useState("");
  const change = (e: any) => {
    const file = e.target.files?.[0];
    if (file) {
      N(file.name);
      onFile(file);
    }
  };
  return (
    <>
      <TextField
        label={label}
        value={name}
        required={required}
        disabled={disabled}
        fullWidth
        margin="normal"
        placeholder="Seleccionar imagen"
        helperText="Toca el campo para cargar una imagen o la cámara para tomarla."
        onClick={() => !disabled && gallery.current?.click()}
        slotProps={{
          inputLabel: { shrink: true },
          input: {
            readOnly: true,
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  aria-label="Tomar foto"
                  disabled={disabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    camera.current?.click();
                  }}
                  edge="end"
                >
                  <CameraAltOutlined />
                </IconButton>
              </InputAdornment>
            ),
          },
        }}
      />
      <input
        ref={gallery}
        type="file"
        accept="image/*"
        hidden
        onChange={change}
        aria-label="Cargar foto del comprobante"
      />
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={change}
        aria-label="Tomar foto del comprobante"
      />
    </>
  );
}
