import { createTheme } from '@mui/material/styles';
import { koKR } from '@mui/material/locale';

export const theme = createTheme(
  {
    cssVariables: true,
    palette: {
      primary: { main: '#216859' },
      secondary: { main: '#46667e' },
      background: { default: '#f4f6f8', paper: '#ffffff' },
      text: { primary: '#203341', secondary: '#627571' },
      divider: '#dce4e7',
    },
    typography: {
      fontFamily: 'Inter, "Segoe UI", "Malgun Gothic", sans-serif',
      fontSize: 13,
      h1: { fontSize: '1.3rem', fontWeight: 700 },
      h2: { fontSize: '1.15rem', fontWeight: 700, lineHeight: 1.5 },
      h3: { fontSize: '1rem', fontWeight: 650, lineHeight: 1.5 },
      h4: { fontSize: '1rem', fontWeight: 600 },
      button: { textTransform: 'none', fontWeight: 600 },
      body1: { fontSize: '0.875rem', lineHeight: 1.65 },
      body2: { fontSize: '0.8125rem', lineHeight: 1.6 },
    },
    shape: { borderRadius: 8 },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          '[hidden]': { display: 'none !important' },
          ':focus-visible': { outline: '2px solid #46667e', outlineOffset: 2 },
          '@media (prefers-reduced-motion: reduce)': {
            '*, *::before, *::after': {
              animation: 'none !important',
              transition: 'none !important',
            },
          },
        },
      },
      MuiButton: {
        defaultProps: { size: 'small', variant: 'outlined', disableElevation: true },
        styleOverrides: {
          root: {
            minHeight: 34,
            flexShrink: 0,
            '&.secondary-button': { backgroundColor: 'transparent' },
          },
        },
      },
      MuiTextField: {
        defaultProps: { size: 'small', variant: 'outlined' },
        styleOverrides: { root: { minWidth: 0 } },
      },
      MuiInputBase: {
        styleOverrides: { root: { fontSize: '0.8125rem', backgroundColor: '#fff' } },
      },
      MuiCheckbox: { defaultProps: { size: 'small' } },
      MuiChip: {
        defaultProps: { size: 'small' },
        styleOverrides: { root: { fontSize: '0.72rem', fontWeight: 600 } },
      },
      MuiPaper: { defaultProps: { elevation: 0 } },
      MuiDialog: {
        defaultProps: { maxWidth: 'lg', fullWidth: true },
        styleOverrides: { paper: { backgroundImage: 'none' } },
      },
      MuiAlert: {
        styleOverrides: {
          root: { alignItems: 'center' },
          message: { minWidth: 0, overflowWrap: 'anywhere' },
        },
      },
      MuiTypography: {
        styleOverrides: {
          h2: { marginBottom: 16 },
          h3: { marginTop: 20, marginBottom: 10 },
          h4: { marginTop: 16, marginBottom: 8 },
        },
      },
    },
  },
  koKR,
);
