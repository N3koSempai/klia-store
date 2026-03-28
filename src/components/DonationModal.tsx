import BoltRounded from "@mui/icons-material/BoltRounded";
import ContentCopyRounded from "@mui/icons-material/ContentCopyRounded";
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { useTranslation } from "react-i18next";

type CryptoOption = "usdc" | "btc";

interface WalletInfo {
  btc: string | null;
  usdc: string | null;
}

interface DonationModalProps {
  open: boolean;
  onClose: () => void;
  appName: string;
  developerName?: string;
  donationUrl?: string;
}

function parseWallets(donationUrl: string | undefined): WalletInfo {
  if (!donationUrl) return { btc: null, usdc: null };
  try {
    const url = new URL(donationUrl);
    const wallet = url.searchParams.get("wallet");
    const path = url.pathname.toLowerCase();
    if (path.includes("/bitcoin/") && wallet) return { btc: wallet, usdc: null };
    if (path.includes("/usdt-eth/") && wallet) return { btc: null, usdc: wallet };
  } catch {
    // ignore
  }
  return { btc: null, usdc: null };
}

export const DonationModal = ({
  open,
  onClose,
  appName,
  developerName,
  donationUrl,
}: DonationModalProps) => {
  const { t } = useTranslation();
  const wallets = parseWallets(donationUrl);

  const defaultCrypto: CryptoOption = wallets.usdc ? "usdc" : wallets.btc ? "btc" : "usdc";
  const [crypto, setCrypto] = useState<CryptoOption>(defaultCrypto);
  const [usdcAmount, setUsdcAmount] = useState("");
  const [btcAmount, setBtcAmount] = useState("");
  const [copied, setCopied] = useState(false);

  const displayName = developerName || appName;
  const activeWallet = crypto === "btc" ? wallets.btc : wallets.usdc;

  const handleCopy = (address: string) => {
    navigator.clipboard.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const canDonate =
    !!activeWallet &&
    (crypto === "btc" ? btcAmount.length > 0 : usdcAmount.length > 0);

  const selectSx = {
    bgcolor: "#0d1117",
    color: "#e6edf3",
    "& .MuiSelect-select": { color: "#e6edf3" },
    "& .MuiOutlinedInput-notchedOutline": { borderColor: "#30363d" },
    "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "#58a6ff" },
    "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "#58a6ff" },
    "& .MuiSvgIcon-root": { color: "#8b949e" },
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: "#161b22",
          backgroundImage: "none",
          border: "1px solid #30363d",
          borderRadius: "12px",
          boxShadow: "0 16px 32px rgba(1,4,9,0.85)",
        },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: 2.5,
          pt: 2.5,
          pb: 2,
          borderBottom: "1px solid #21262d",
          display: "flex",
          alignItems: "flex-start",
          gap: 1.5,
        }}
      >
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: "8px",
            bgcolor: "rgba(210, 153, 34, 0.1)",
            border: "1px solid rgba(210, 153, 34, 0.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <BoltRounded sx={{ color: "#d29922", fontSize: 20 }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="subtitle1"
            fontWeight={700}
            color="#e6edf3"
            fontFamily="Inter, sans-serif"
            lineHeight={1.3}
          >
            {t("donation.supportTitle", { name: displayName })}
          </Typography>
          <Typography variant="caption" color="#6e7681" fontFamily="Inter, sans-serif">
            {t("donation.helpKeepAlive")}
          </Typography>
        </Box>
        <IconButton
          size="small"
          onClick={onClose}
          sx={{
            color: "#6e7681",
            mt: -0.5,
            mr: -0.5,
            "&:hover": { color: "#e6edf3", bgcolor: "rgba(110,118,129,0.1)" },
          }}
        >
          <Typography fontSize="1.1rem" lineHeight={1}>×</Typography>
        </IconButton>
      </Box>

      <DialogContent sx={{ px: 2.5, pt: 2.5, pb: 2.5 }}>
        {/* Currency dropdown */}
        <FormControl fullWidth size="small" sx={{ mb: 2.5 }}>
          <InputLabel
            sx={{
              color: "#8b949e",
              fontSize: "0.85rem",
              "&.Mui-focused": { color: "#58a6ff" },
            }}
          >
            {t("donation.selectCurrency")}
          </InputLabel>
          <Select
            value={crypto}
            label={t("donation.selectCurrency")}
            onChange={(e) => setCrypto(e.target.value as CryptoOption)}
            sx={selectSx}
            MenuProps={{
              PaperProps: {
                sx: {
                  bgcolor: "#21262d",
                  border: "1px solid #30363d",
                  borderRadius: "8px",
                  boxShadow: "0 8px 24px rgba(1,4,9,0.8)",
                  "& .MuiMenuItem-root": {
                    color: "#e6edf3",
                    "&:hover": { bgcolor: "rgba(88,166,255,0.08)" },
                    "&.Mui-selected": {
                      bgcolor: "rgba(88,166,255,0.1)",
                      "&:hover": { bgcolor: "rgba(88,166,255,0.15)" },
                    },
                    "&.Mui-disabled": {
                      opacity: 0.45,
                    },
                  },
                },
              },
            }}
          >
            {/* USDC option */}
            <MenuItem value="usdc" disabled={!wallets.usdc} sx={{ py: 0.75, minHeight: "unset" }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, width: "100%" }}>
                <Typography fontSize="0.95rem" lineHeight={1}>💵</Typography>
                <Typography variant="body2" fontWeight={600} color="#e6edf3" fontSize="0.85rem">
                  USDC
                </Typography>
                <Typography variant="caption" color="#8b949e" fontSize="0.72rem">
                  · {t("donation.ethNetwork")}
                </Typography>
                {!wallets.usdc && (
                  <Typography variant="caption" color="#8b949e" fontSize="0.7rem" sx={{ ml: "auto" }}>
                    {t("donation.notConfigured")}
                  </Typography>
                )}
              </Box>
            </MenuItem>

            {/* BTC option */}
            <MenuItem value="btc" disabled={!wallets.btc} sx={{ py: 0.75, minHeight: "unset" }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, width: "100%" }}>
                <Typography fontSize="0.95rem" lineHeight={1}>₿</Typography>
                <Typography variant="body2" fontWeight={600} color="#e6edf3" fontSize="0.85rem">
                  Bitcoin
                </Typography>
                <Typography variant="caption" color="#8b949e" fontSize="0.72rem">
                  · {t("donation.btcNetwork")}
                </Typography>
                {!wallets.btc && (
                  <Typography variant="caption" color="#8b949e" fontSize="0.7rem" sx={{ ml: "auto" }}>
                    {t("donation.notConfigured")}
                  </Typography>
                )}
              </Box>
            </MenuItem>
          </Select>
        </FormControl>

        {/* Amount label */}
        <Typography
          variant="caption"
          color="#8b949e"
          fontFamily="Inter, sans-serif"
          fontWeight={600}
          sx={{
            display: "block",
            mb: 0.75,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            fontSize: "0.7rem",
          }}
        >
          {t("donation.enterAmount")}
        </Typography>

        {/* Amount input */}
        {crypto === "usdc" ? (
          <TextField
            fullWidth
            size="small"
            type="number"
            value={usdcAmount}
            disabled={!wallets.usdc}
            onChange={(e) => setUsdcAmount(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder={t("donation.usdcPlaceholder")}
            inputProps={{ min: 1, step: 1 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Typography color="#8b949e" fontWeight={700} fontSize="0.95rem">$</Typography>
                </InputAdornment>
              ),
            }}
            sx={{
              mb: 2,
              "& .MuiOutlinedInput-root": {
                bgcolor: "#0d1117",
                fontFamily: "monospace",
                color: "#e6edf3",
                "& fieldset": { borderColor: "#30363d" },
                "&:hover fieldset": { borderColor: "#58a6ff" },
                "&.Mui-focused fieldset": { borderColor: "#58a6ff" },
                "&.Mui-disabled": { opacity: 0.5 },
              },
              "& input[type=number]": { MozAppearance: "textfield" },
              "& input[type=number]::-webkit-inner-spin-button, & input[type=number]::-webkit-outer-spin-button":
                { WebkitAppearance: "none", margin: 0 },
            }}
          />
        ) : (
          <TextField
            fullWidth
            size="small"
            type="text"
            value={btcAmount}
            disabled={!wallets.btc}
            onChange={(e) => {
              const val = e.target.value.replace(/[^0-9.,]/g, "").replace(",", ".");
              setBtcAmount(val);
            }}
            placeholder={t("donation.btcPlaceholder")}
            inputProps={{ inputMode: "decimal" }}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <Typography color="#d29922" fontWeight={700} fontSize="0.75rem" fontFamily="monospace">
                    BTC
                  </Typography>
                </InputAdornment>
              ),
            }}
            sx={{
              mb: 2,
              "& .MuiOutlinedInput-root": {
                bgcolor: "#0d1117",
                fontFamily: "monospace",
                color: "#e6edf3",
                "& fieldset": { borderColor: "#30363d" },
                "&:hover fieldset": { borderColor: "#d29922" },
                "&.Mui-focused fieldset": { borderColor: "#d29922" },
                "&.Mui-disabled": { opacity: 0.5 },
              },
            }}
          />
        )}

        {/* Wallet address */}
        {activeWallet && (
          <>
            <Typography
              variant="caption"
              color="#8b949e"
              fontFamily="Inter, sans-serif"
              fontWeight={600}
              sx={{
                display: "block",
                mb: 0.75,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                fontSize: "0.7rem",
              }}
            >
              {t("donation.sendTo")}
            </Typography>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                px: 1.5,
                py: 1,
                bgcolor: "#0d1117",
                border: "1px solid #21262d",
                borderRadius: "6px",
                mb: 2.5,
              }}
            >
              <Typography
                variant="caption"
                fontFamily="monospace"
                color="#8b949e"
                sx={{ flex: 1, wordBreak: "break-all", lineHeight: 1.5, fontSize: "0.75rem" }}
              >
                {activeWallet}
              </Typography>
              <Tooltip
                title={copied ? t("donation.copied") : t("donation.copyAddress")}
                arrow
                placement="top"
              >
                <IconButton
                  size="small"
                  onClick={() => handleCopy(activeWallet)}
                  sx={{
                    color: copied ? "#3fb950" : "#6e7681",
                    flexShrink: 0,
                    "&:hover": { color: "#e6edf3", bgcolor: "rgba(110,118,129,0.1)" },
                  }}
                >
                  <ContentCopyRounded sx={{ fontSize: "0.9rem" }} />
                </IconButton>
              </Tooltip>
            </Box>
          </>
        )}

        {/* Donate button — centered, not full width */}
        <Box sx={{ display: "flex", justifyContent: "center" }}>
          <Button
            variant="contained"
            size="medium"
            onClick={() => activeWallet && handleCopy(activeWallet)}
            disabled={!canDonate}
            startIcon={<BoltRounded />}
            sx={{
              px: 4,
              py: 1,
              fontWeight: 600,
              fontFamily: "Inter, sans-serif",
              fontSize: "0.875rem",
              textTransform: "none",
              bgcolor: crypto === "btc" ? "#d29922" : "#238636",
              color: crypto === "btc" ? "#0d1117" : "#ffffff",
              border: "1px solid",
              borderColor: crypto === "btc" ? "rgba(210,153,34,0.5)" : "rgba(63,185,80,0.5)",
              boxShadow: "none",
              "&:hover": {
                bgcolor: crypto === "btc" ? "#e3a918" : "#2ea043",
                boxShadow: "none",
              },
              "&.Mui-disabled": {
                bgcolor: "#21262d",
                color: "#484f58",
                borderColor: "#21262d",
              },
            }}
          >
            {t("donation.donate")}
          </Button>
        </Box>
      </DialogContent>
    </Dialog>
  );
};
