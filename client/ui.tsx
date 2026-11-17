import React, { useState } from "react";
import { createTheme } from "@mui/material/styles";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import MuiButton from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import NativeSelect from "@mui/material/NativeSelect";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import IconButton from "@mui/material/IconButton";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Drawer from "@mui/material/Drawer";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import BottomNavigation from "@mui/material/BottomNavigation";
import BottomNavigationAction from "@mui/material/BottomNavigationAction";
import Badge from "@mui/material/Badge";
import SpeedDial from "@mui/material/SpeedDial";
import SpeedDialAction from "@mui/material/SpeedDialAction";
import SpeedDialIcon from "@mui/material/SpeedDialIcon";
import Paper from "@mui/material/Paper";
import MenuIcon from "@mui/icons-material/Menu";
import Notifications from "@mui/icons-material/Notifications";
import Close from "@mui/icons-material/Close";
import Logout from "@mui/icons-material/Logout";
import ReceiptLong from "@mui/icons-material/ReceiptLong";
import History from "@mui/icons-material/History";
import Payments from "@mui/icons-material/Payments";
import People from "@mui/icons-material/People";
import Inventory from "@mui/icons-material/Inventory";
import Settings from "@mui/icons-material/Settings";
import LocalShipping from "@mui/icons-material/LocalShipping";
import Restaurant from "@mui/icons-material/Restaurant";
import Add from "@mui/icons-material/Add";
import PersonAdd from "@mui/icons-material/PersonAdd";
import AddLocationAlt from "@mui/icons-material/AddLocationAlt";
import PriceChange from "@mui/icons-material/PriceChange";
import AccountBalanceWallet from "@mui/icons-material/AccountBalanceWallet";
import NotificationsActive from "@mui/icons-material/NotificationsActive";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { DateTimePicker } from "@mui/x-date-pickers/DateTimePicker";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { TimePicker } from "@mui/x-date-pickers/TimePicker";
import { esES } from "@mui/x-date-pickers/locales";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import "dayjs/locale/es";
dayjs.extend(utc);
dayjs.extend(timezone);
const theme = createTheme({
  palette: {
    primary: { main: "#143e2b" },
    secondary: { main: "#e8bc36" },
    background: { default: "#f4f6f1" },
    text: { primary: "#183d2c", secondary: "#6d7d6e" },
    error: { main: "#a53c35" },
  },
  typography: {
    fontFamily: '"DM Sans",sans-serif',
    button: { textTransform: "none" },
  },
  shape: { borderRadius: 10 },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { borderRadius: 9 } },
    },
    MuiDialog: { defaultProps: { fullWidth: true, maxWidth: "sm" } },
  },
});
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <LocalizationProvider
        dateAdapter={AdapterDayjs}
        adapterLocale="es"
        localeText={
          esES.components.MuiLocalizationProvider.defaultProps.localeText
        }
      >
        {children}
      </LocalizationProvider>
    </ThemeProvider>
  );
}
export function Button({ className = "", type = "button", ...props }: any) {
  return (
    <MuiButton
      type={type}
      variant={className.includes("neutral") ? "outlined" : "contained"}
      color={className.includes("danger") ? "error" : "primary"}
      className={className}
      {...props}
    />
  );
}
export function Field({
  label,
  required = true,
  type = "text",
  min,
  max,
  step,
  ...props
}: any) {
  if (["date", "datetime-local", "time"].includes(type))
    return (
      <DateInput label={label} required={required} type={type} {...props} />
    );
  return (
    <TextField
      label={label}
      required={required}
      type={type}
      fullWidth
      margin="normal"
      slotProps={{ htmlInput: { min, max, step } }}
      {...props}
    />
  );
}
export function DateInput({
  label,
  name,
  type = "date",
  value,
  onChange,
  defaultValue,
  required = false,
}: any) {
  const [internal, S] = useState(defaultValue ? dayjs(defaultValue) : null);
  const controlled = value !== undefined;
  const current = controlled ? (value ? dayjs(value) : null) : internal;
  const Picker =
    type === "datetime-local"
      ? DateTimePicker
      : type === "time"
        ? TimePicker
        : DatePicker;
  return (
    <Box sx={{ my: 2, minWidth: 0, flex: 1 }}>
      <Picker
        label={label}
        value={current}
        timezone="America/Bogota"
        onChange={(v) => {
          S(v);
          if (onChange)
            onChange({
              target: {
                value: v?.isValid()
                  ? type === "date"
                    ? v.format("YYYY-MM-DD")
                    : v.toISOString()
                  : "",
              },
            });
        }}
        slotProps={{ textField: { fullWidth: true, required } }}
      />
      {name && (
        <input
          type="hidden"
          name={name}
          value={
            current?.isValid()
              ? type === "date"
                ? current.format("YYYY-MM-DD")
                : current.toISOString()
              : ""
          }
        />
      )}
    </Box>
  );
}
export function Select({ children, ...props }: any) {
  return (
    <NativeSelect fullWidth variant="standard" {...props}>
      {children}
    </NativeSelect>
  );
}
export function Modal({ title, children, onClose }: any) {
  return (
    <Dialog open onClose={onClose} aria-labelledby="dialog-title">
      <DialogTitle
        id="dialog-title"
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        {title}
        <IconButton aria-label="Cerrar" onClick={onClose}>
          <Close />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>{children}</DialogContent>
    </Dialog>
  );
}
const navFor = (role: string) =>
  role === "admin"
    ? [
        ["orders", "Pedidos", ReceiptLong],
        ["history", "Historial", History],
        ["payments", "Cobros", Payments],

        ["catalog", "Catálogo", Inventory],
        ["settings", "Ajustes", Settings],
      ]
    : role === "courier"
      ? [
          ["mine", "Mis entregas", LocalShipping],
          ["available", "Disponibles", ReceiptLong],
          ["payments", "Cobros", Payments],
          ["settings", "Ajustes", Settings],
        ]
      : role === "preparation"
        ? [
            ["orders", "Preparación", Restaurant],
            ["settings", "Ajustes", Settings],
          ]
        : [
            ["orders", "Mis pedidos", ReceiptLong],
            ["payments", "Mi cartera", Payments],
            ["settings", "Ajustes", Settings],
          ];
export function Navigation({
  user,
  view,
  onNavigate,
  onNotice,
  onLogout,
  unread,
  online,
  pending,
}: any) {
  const nav = navFor(user.role);
  const mobileNav = nav;
  return (
    <>
      <AppBar position="sticky" elevation={0} sx={{ zIndex: 1201 }}>
        <Toolbar sx={{ gap: 2, minHeight: 80 }}>
          <Box
            component="img"
            src="/logo.png"
            alt="Delipiña"
            sx={{ width: 130, height: 65, objectFit: "contain" }}
          />
          <Typography
            sx={{
              display: { xs: "none", sm: "block" },
              borderLeft: "1px solid #ffffff40",
              pl: 2,
            }}
          >
            {user.name}
          </Typography>
          <Box sx={{ flex: 1 }} />
          <Typography variant="caption">
            {online ? "● En línea" : "○ Sin conexión"}
            {pending > 0 && ` · ${pending} pendientes`}
          </Typography>
          <IconButton
            color="inherit"
            aria-label="Notificaciones"
            onClick={onNotice}
          >
            <Badge badgeContent={unread} color="secondary">
              <Notifications />
            </Badge>
          </IconButton>
          <IconButton
            color="inherit"
            aria-label="Cerrar sesión"
            onClick={onLogout}
          >
            <Logout />
          </IconButton>
        </Toolbar>
      </AppBar>
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: "none", md: "block" },
          width: 220,
          "& .MuiDrawer-paper": {
            width: 220,
            top: 80,
            height: "calc(100% - 80px)",
            borderRight: "1px solid #dfe6d7",
            background: "#fbfcf8",
          },
        }}
      >
        <Box sx={{ p: 2, pb: 0 }}>
          <Typography variant="overline" color="text.secondary">
            MÓDULOS
          </Typography>
        </Box>
        <List>
          {nav.map(([id, label, Icon]: any) => (
            <ListItemButton
              key={id}
              selected={view === id}
              onClick={() => onNavigate(id)}
              sx={{ mx: 1, my: 0.5, borderRadius: 2 }}
            >
              <ListItemIcon sx={{ minWidth: 38 }}>
                <Icon />
              </ListItemIcon>
              <ListItemText primary={label} />
            </ListItemButton>
          ))}
        </List>
      </Drawer>
      <Paper
        elevation={3}
        sx={{
          display: { xs: "block", md: "none" },
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 1200,
          pb: "env(safe-area-inset-bottom)",
        }}
      >
        <BottomNavigation
          value={view}
          onChange={(_, v) => onNavigate(v)}
          showLabels
          sx={{
            height: 68,
            overflowX: "auto",
            justifyContent: "center",
          }}
        >
          {mobileNav.map(([id, label, Icon]: any) => (
            <BottomNavigationAction
              key={id}
              value={id}
              label={label}
              icon={<Icon />}
              sx={{ minWidth: 64, flexShrink: 0, fontSize: 11 }}
            />
          ))}
        </BottomNavigation>
      </Paper>
    </>
  );
}
export function SecondaryActions({ role, onAction, onPush }: any) {
  const actions =
    role === "admin"
      ? [
          ["Crear sucursal", AddLocationAlt, () => onAction("branch")],
          [
            "Autorizar cupo",
            AccountBalanceWallet,
            () => onAction({ kind: "credit" }),
          ],
          ["Precio especial", PriceChange, () => onAction({ kind: "price" })],
        ]
      : role === "client"
        ? [["Crear sucursal", AddLocationAlt, () => onAction("branch")]]
        : [];
  if (!actions.length) return null;
  return (
    <SpeedDial
      ariaLabel="Acciones secundarias"
      icon={<SpeedDialIcon />}
      sx={{
        position: "fixed",
        bottom: { xs: 90, md: 28 },
        right: 24,
        zIndex: 1199,
      }}
    >
      {actions.map(([name, Icon, handler]: any) => (
        <SpeedDialAction
          key={name}
          icon={<Icon />}
          slotProps={{ tooltip: { title: name } }}
          onClick={handler}
          aria-label={name}
        />
      ))}
    </SpeedDial>
  );
}

export function NoticeDrawer({ onClose, children }: any) {
  return (
    <Drawer
      anchor="right"
      open
      onClose={onClose}
      sx={{
        zIndex: 1300,
        "& .MuiDrawer-paper": { width: 390, maxWidth: "100%", p: 3 },
      }}
    >
      {children}
    </Drawer>
  );
}
