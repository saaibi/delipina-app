import React, { useState } from "react";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import IconButton from "@mui/material/IconButton";
import DateRange from "@mui/icons-material/DateRange";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import dayjs from "dayjs";
import { Field } from "./ui";
export function periodDates(label: string) {
  const now = dayjs().tz("America/Bogota");
  if (label === "Mes Actual")
    return {
      from: now.startOf("month").format("YYYY-MM-DD"),
      to: now.format("YYYY-MM-DD"),
    };
  if (label === "Año Actual")
    return {
      from: now.startOf("year").format("YYYY-MM-DD"),
      to: now.format("YYYY-MM-DD"),
    };
  const match = label.match(/^(\d+)\s*(mes(?:es)?|año(?:s)?)$/i);
  if (match) {
    const n = Number(match[1]);
    if (n < 1 || n > 100) return null;
    return {
      from: now
        .subtract(
          n,
          match[2].toLowerCase().startsWith("mes") ? "month" : "year",
        )
        .format("YYYY-MM-DD"),
      to: now.format("YYYY-MM-DD"),
    };
  }
  return null;
}
export function PeriodPicker({ onChange }: any) {
  const [label, L] = useState("1 Año"),
    [anchor, A] = useState(null),
    [range, R] = useState(periodDates("1 Año"));
  function select(value) {
    L(value);
    A(null);
    if (value === "Rango de fecha") return;
    const dates = periodDates(value);
    if (dates) {
      R(dates);
      onChange(dates);
    }
  }
  return (
    <div className="analytics-period">
      <TextField
        fullWidth
        label="Periodo de análisis"
        value={label}
        onChange={(e) => L(e.target.value)}
        onBlur={() => {
          const d = periodDates(label);
          if (d) {
            R(d);
            onChange(d);
          }
        }}
        slotProps={{
          input: {
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  aria-label="Seleccionar periodo"
                  onClick={(e) => A(e.currentTarget)}
                >
                  <DateRange />
                </IconButton>
              </InputAdornment>
            ),
          },
        }}
      />
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => A(null)}>
        {[
          "Mes Actual",
          "1 Mes",
          "6 Meses",
          "Año Actual",
          "1 Año",
          "Rango de fecha",
        ].map((v) => (
          <MenuItem key={v} selected={label === v} onClick={() => select(v)}>
            {v}
          </MenuItem>
        ))}
      </Menu>
      {label === "Rango de fecha" && (
        <div className="row">
          <Field
            type="date"
            label="Desde"
            value={range.from}
            onChange={(e) => {
              const d = { ...range, from: e.target.value };
              R(d);
              onChange(d);
            }}
          />
          <Field
            type="date"
            label="Hasta"
            value={range.to}
            onChange={(e) => {
              const d = { ...range, to: e.target.value };
              R(d);
              onChange(d);
            }}
          />
        </div>
      )}
      <small>
        {range.from} — {range.to}
      </small>
    </div>
  );
}
