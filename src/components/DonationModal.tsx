import BoltRounded from "@mui/icons-material/BoltRounded";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import ContentCopyRounded from "@mui/icons-material/ContentCopyRounded";
import ErrorOutlineRounded from "@mui/icons-material/ErrorOutlineRounded";
import {
	Box,
	Button,
	CircularProgress,
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
import { invoke } from "@tauri-apps/api/core";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { hues, neutral, status } from "../theme/tokens";
import { dbCacheManager } from "../utils/dbCache";

type CryptoOption = "usdt" | "btc";
type ModalView = "input" | "payment" | "verifying" | "success" | "not_found";

interface WalletInfo {
	btc: string | null;
	usdt: string | null;
}

interface DonationModalProps {
	open: boolean;
	onClose: () => void;
	appId: string;
	appName: string;
	developerName?: string;
	donationUrl?: string;
	isInstalled: boolean;
	onInstall: () => void;
}

function parseWallets(donationUrl: string | undefined): WalletInfo {
	if (!donationUrl) return { btc: null, usdt: null };
	try {
		const url = new URL(donationUrl);
		const wallet = url.searchParams.get("wallet");
		const path = url.pathname.toLowerCase();
		if (path.includes("/bitcoin/") && wallet)
			return { btc: wallet, usdt: null };
		if (path.includes("/ethereum/") && wallet)
			return { btc: null, usdt: wallet };
	} catch {
		// ignore
	}
	return { btc: null, usdt: null };
}

interface DonationHeaderProps {
	subtitle: string;
	displayName: string;
	onClose: () => void;
}

function DonationHeader({
	subtitle,
	displayName,
	onClose,
}: DonationHeaderProps) {
	const { t } = useTranslation();
	return (
		<Box
			sx={{
				px: 2.5,
				pt: 2.5,
				pb: 2,
				borderBottom: `1px solid ${neutral[200]}`,
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
				<BoltRounded sx={{ color: status.warning, fontSize: 20 }} />
			</Box>
			<Box sx={{ flex: 1, minWidth: 0 }}>
				<Typography
					variant="subtitle1"
					fontWeight={700}
					color={neutral[900]}
					fontFamily="Inter, sans-serif"
					lineHeight={1.3}
				>
					{t("donation.supportTitle", { name: displayName })}
				</Typography>
				<Typography
					variant="caption"
					color={neutral[500]}
					fontFamily="Inter, sans-serif"
				>
					{subtitle}
				</Typography>
			</Box>
			<IconButton
				size="small"
				onClick={onClose}
				sx={{
					color: neutral[500],
					mt: -0.5,
					mr: -0.5,
					"&:hover": { color: neutral[900], bgcolor: "rgba(110,118,129,0.1)" },
				}}
			>
				<Typography fontSize="1.1rem" lineHeight={1}>
					×
				</Typography>
			</IconButton>
		</Box>
	);
}

/** BIP-21 URI for BTC wallets so most mobile wallets pre-fill the amount */
function btcQrData(address: string, amount: string): string {
	const amt = Number.parseFloat(amount);
	if (amt > 0) return `bitcoin:${address}?amount=${amount}`;
	return `bitcoin:${address}`;
}

export const DonationModal = ({
	open,
	onClose,
	appId,
	appName,
	developerName,
	donationUrl,
	isInstalled,
	onInstall,
}: DonationModalProps) => {
	const { t } = useTranslation();
	const wallets = parseWallets(donationUrl);

	const defaultCrypto: CryptoOption = wallets.usdt
		? "usdt"
		: wallets.btc
			? "btc"
			: "usdt";

	const [view, setView] = useState<ModalView>("input");
	const [crypto, setCrypto] = useState<CryptoOption>(defaultCrypto);
	const [usdtAmount, setUsdtAmount] = useState("");
	const [btcAmount, setBtcAmount] = useState("");
	const [copied, setCopied] = useState(false);
	const [verifyTxId, setVerifyTxId] = useState<string | null>(null);
	const [countdown, setCountdown] = useState(5);
	const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

	// Countdown after success — only when app is not yet installed
	// biome-ignore lint/correctness/useExhaustiveDependencies: handleClose is recreated on every render; adding it without useCallback would cause infinite re-runs
	useEffect(() => {
		if (view === "success" && !isInstalled) {
			setCountdown(5);
			countdownRef.current = setInterval(() => {
				setCountdown((prev) => {
					if (prev <= 1) {
						if (countdownRef.current !== null)
							clearInterval(countdownRef.current);
						countdownRef.current = null;
						handleClose();
						onInstall();
						return 0;
					}
					return prev - 1;
				});
			}, 1000);
		}
		return () => {
			if (countdownRef.current) {
				clearInterval(countdownRef.current);
				countdownRef.current = null;
			}
		};
	}, [view]);

	const displayName = developerName || appName;
	const activeWallet = crypto === "btc" ? wallets.btc : wallets.usdt;
	const activeAmount = crypto === "btc" ? btcAmount : usdtAmount;

	const canDonate =
		!!activeWallet &&
		(crypto === "btc" ? btcAmount.length > 0 : usdtAmount.length > 0);

	const handleCopy = (text: string) => {
		navigator.clipboard.writeText(text).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		});
	};

	const handleDonate = () => {
		if (canDonate) setView("payment");
	};

	const handleVerify = async () => {
		if (!activeWallet) return;
		setView("verifying");

		try {
			let result: { found: boolean; txId?: string };

			if (crypto === "btc") {
				result = await invoke("verify_btc_donation", {
					wallet: activeWallet,
					amountBtc: btcAmount,
				});
			} else {
				result = await invoke("verify_usdt_eth_donation", {
					wallet: activeWallet,
					amountUsdt: usdtAmount,
				});
			}

			if (result.found) {
				const txId = result.txId ?? null;
				setVerifyTxId(txId);
				setView("success");

				// Persist donation record
				try {
					await dbCacheManager.recordDonation({
						appId,
						appName,
						amount: activeAmount,
						currency: crypto === "btc" ? "BTC" : "USDT",
						network: crypto === "btc" ? "Bitcoin" : "Ethereum",
						txId,
					});
				} catch (dbErr) {
					console.error("[Donation] Failed to record donation:", dbErr);
				}
			} else {
				setView("not_found");
			}
		} catch {
			setView("not_found");
		}
	};

	const handleClose = () => {
		onClose();
		// Reset state after dialog close animation
		setTimeout(() => {
			setView("input");
			setUsdtAmount("");
			setBtcAmount("");
			setCopied(false);
			setVerifyTxId(null);
		}, 300);
	};

	const selectSx = {
		bgcolor: neutral[50],
		color: neutral[900],
		"& .MuiSelect-select": { color: neutral[900] },
		"& .MuiOutlinedInput-notchedOutline": { borderColor: neutral[300] },
		"&:hover .MuiOutlinedInput-notchedOutline": { borderColor: status.info },
		"&.Mui-focused .MuiOutlinedInput-notchedOutline": {
			borderColor: status.info,
		},
		"& .MuiSvgIcon-root": { color: neutral[600] },
	};

	return (
		<Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
			{/* ─── INPUT VIEW ─────────────────────────────────────────────────── */}
			{view === "input" && (
				<>
					<DonationHeader
						subtitle={t("donation.helpKeepAlive")}
						displayName={displayName}
						onClose={handleClose}
					/>
					<DialogContent sx={{ px: 2.5, pt: 2.5, pb: 2.5 }}>
						{/* Currency dropdown */}
						<FormControl fullWidth size="small" sx={{ mb: 2.5 }}>
							<InputLabel
								sx={{
									color: neutral[600],
									fontSize: "0.85rem",
									"&.Mui-focused": { color: status.info },
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
											bgcolor: neutral[200],
											border: `1px solid ${neutral[300]}`,
											borderRadius: "8px",
											boxShadow: "0 8px 24px rgba(1,4,9,0.8)",
											"& .MuiMenuItem-root": {
												color: neutral[900],
												"&:hover": { bgcolor: "rgba(88,166,255,0.08)" },
												"&.Mui-selected": {
													bgcolor: "rgba(88,166,255,0.1)",
													"&:hover": { bgcolor: "rgba(88,166,255,0.15)" },
												},
												"&.Mui-disabled": { opacity: 0.45 },
											},
										},
									},
								}}
							>
								<MenuItem
									value="usdt"
									disabled={!wallets.usdt}
									sx={{ py: 0.75, minHeight: "unset" }}
								>
									<Box
										sx={{
											display: "flex",
											alignItems: "center",
											gap: 1,
											width: "100%",
										}}
									>
										<Typography fontSize="0.95rem" lineHeight={1}>
											💵
										</Typography>
										<Typography
											variant="body2"
											fontWeight={600}
											color={neutral[900]}
											fontSize="0.85rem"
										>
											USDT
										</Typography>
										<Typography
											variant="caption"
											color={neutral[600]}
											fontSize="0.72rem"
										>
											· {t("donation.ethNetwork")}
										</Typography>
										{!wallets.usdt && (
											<Typography
												variant="caption"
												color={neutral[600]}
												fontSize="0.7rem"
												sx={{ ml: "auto" }}
											>
												{t("donation.notConfigured")}
											</Typography>
										)}
									</Box>
								</MenuItem>

								<MenuItem
									value="btc"
									disabled={!wallets.btc}
									sx={{ py: 0.75, minHeight: "unset" }}
								>
									<Box
										sx={{
											display: "flex",
											alignItems: "center",
											gap: 1,
											width: "100%",
										}}
									>
										<Typography fontSize="0.95rem" lineHeight={1}>
											₿
										</Typography>
										<Typography
											variant="body2"
											fontWeight={600}
											color={neutral[900]}
											fontSize="0.85rem"
										>
											Bitcoin
										</Typography>
										<Typography
											variant="caption"
											color={neutral[600]}
											fontSize="0.72rem"
										>
											· {t("donation.btcNetwork")}
										</Typography>
										{!wallets.btc && (
											<Typography
												variant="caption"
												color={neutral[600]}
												fontSize="0.7rem"
												sx={{ ml: "auto" }}
											>
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
							color={neutral[600]}
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
						{crypto === "usdt" ? (
							<TextField
								fullWidth
								size="small"
								type="number"
								value={usdtAmount}
								disabled={!wallets.usdt}
								onChange={(e) =>
									setUsdtAmount(e.target.value.replace(/[^0-9]/g, ""))
								}
								placeholder={t("donation.usdtPlaceholder")}
								inputProps={{ min: 1, step: 1 }}
								InputProps={{
									startAdornment: (
										<InputAdornment position="start">
											<Typography
												color={neutral[600]}
												fontWeight={700}
												fontSize="0.95rem"
											>
												$
											</Typography>
										</InputAdornment>
									),
								}}
								sx={{
									mb: 2,
									"& .MuiOutlinedInput-root": {
										bgcolor: neutral[50],
										fontFamily: "monospace",
										color: neutral[900],
										"& fieldset": { borderColor: neutral[300] },
										"&:hover fieldset": { borderColor: status.info },
										"&.Mui-focused fieldset": { borderColor: status.info },
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
									const val = e.target.value
										.replace(/[^0-9.,]/g, "")
										.replace(",", ".");
									setBtcAmount(val);
								}}
								placeholder={t("donation.btcPlaceholder")}
								inputProps={{ inputMode: "decimal" }}
								InputProps={{
									endAdornment: (
										<InputAdornment position="end">
											<Typography
												color={status.warning}
												fontWeight={700}
												fontSize="0.75rem"
												fontFamily="monospace"
											>
												BTC
											</Typography>
										</InputAdornment>
									),
								}}
								sx={{
									mb: 2,
									"& .MuiOutlinedInput-root": {
										bgcolor: neutral[50],
										fontFamily: "monospace",
										color: neutral[900],
										"& fieldset": { borderColor: neutral[300] },
										"&:hover fieldset": { borderColor: status.warning },
										"&.Mui-focused fieldset": { borderColor: status.warning },
										"&.Mui-disabled": { opacity: 0.5 },
									},
								}}
							/>
						)}

						<Box sx={{ display: "flex", justifyContent: "center" }}>
							<Button
								variant="contained"
								size="medium"
								onClick={handleDonate}
								disabled={!canDonate}
								startIcon={<BoltRounded />}
								sx={{
									px: 4,
									py: 1,
									fontWeight: 600,
									fontFamily: "Inter, sans-serif",
									fontSize: "0.875rem",
									textTransform: "none",
									bgcolor: crypto === "btc" ? status.warning : hues.greenDark,
									color: crypto === "btc" ? neutral[50] : neutral[1000],
									border: "1px solid",
									borderColor:
										crypto === "btc"
											? "rgba(210,153,34,0.5)"
											: "rgba(63,185,80,0.5)",
									boxShadow: "none",
									"&:hover": {
										bgcolor: crypto === "btc" ? hues.amberDeep : hues.greenDeep,
										boxShadow: "none",
									},
									"&.Mui-disabled": {
										bgcolor: neutral[200],
										color: neutral[400],
										borderColor: neutral[200],
									},
								}}
							>
								{t("donation.donate")}
							</Button>
						</Box>
					</DialogContent>
				</>
			)}

			{/* ─── PAYMENT VIEW ───────────────────────────────────────────────── */}
			{(view === "payment" || view === "verifying" || view === "not_found") &&
				activeWallet && (
					<>
						<DonationHeader
							subtitle={t("donation.helpKeepAlive")}
							displayName={displayName}
							onClose={handleClose}
						/>
						<DialogContent
							sx={{ px: 2.5, pt: 2.5, pb: 2.5, textAlign: "center" }}
						>
							{/* QR Code */}
							<Box
								sx={{
									display: "inline-flex",
									p: 1.5,
									bgcolor: neutral[1000],
									borderRadius: "10px",
									mb: 2,
								}}
							>
								<QRCodeSVG
									value={
										crypto === "btc"
											? btcQrData(activeWallet, btcAmount)
											: activeWallet
									}
									size={160}
									bgColor={neutral[1000]}
									fgColor={neutral[50]}
									level="M"
								/>
							</Box>

							{/* Exact amount */}
							<Typography
								variant="caption"
								color={neutral[600]}
								fontWeight={600}
								sx={{
									display: "block",
									textTransform: "uppercase",
									letterSpacing: "0.05em",
									fontSize: "0.7rem",
									mb: 0.5,
								}}
							>
								{t("donation.sendExactly")}
							</Typography>
							<Typography
								variant="h6"
								fontWeight={700}
								fontFamily="monospace"
								color={crypto === "btc" ? status.warning : status.info}
								sx={{ mb: 0.5 }}
							>
								{activeAmount} {crypto === "btc" ? "BTC" : "USDT"}
							</Typography>
							<Typography
								variant="caption"
								color={neutral[500]}
								fontSize="0.72rem"
							>
								{t("donation.sendExactNote")}
							</Typography>

							{/* Wallet address row */}
							<Box
								sx={{
									display: "flex",
									alignItems: "center",
									gap: 1,
									px: 1.5,
									py: 0.75,
									mt: 1.5,
									mb: 2,
									bgcolor: neutral[50],
									border: `1px solid ${neutral[200]}`,
									borderRadius: "6px",
									textAlign: "left",
								}}
							>
								<Typography
									variant="caption"
									fontFamily="monospace"
									color={neutral[600]}
									sx={{
										flex: 1,
										wordBreak: "break-all",
										lineHeight: 1.5,
										fontSize: "0.72rem",
									}}
								>
									{activeWallet}
								</Typography>
								<Tooltip
									title={
										copied ? t("donation.copied") : t("donation.copyAddress")
									}
									arrow
									placement="top"
								>
									<IconButton
										size="small"
										onClick={() => handleCopy(activeWallet)}
										sx={{
											color: copied ? status.success : neutral[500],
											flexShrink: 0,
											"&:hover": {
												color: neutral[900],
												bgcolor: "rgba(110,118,129,0.1)",
											},
										}}
									>
										<ContentCopyRounded sx={{ fontSize: "0.9rem" }} />
									</IconButton>
								</Tooltip>
							</Box>

							{/* Not found warning */}
							{view === "not_found" && (
								<Box
									sx={{
										display: "flex",
										alignItems: "center",
										gap: 1,
										px: 1.5,
										py: 1,
										mb: 2,
										bgcolor: "rgba(248,81,73,0.06)",
										border: "1px solid rgba(248,81,73,0.25)",
										borderRadius: "6px",
									}}
								>
									<ErrorOutlineRounded
										sx={{
											color: status.danger,
											fontSize: "1rem",
											flexShrink: 0,
										}}
									/>
									<Typography
										variant="caption"
										color={status.danger}
										fontSize="0.78rem"
										textAlign="left"
									>
										{t("donation.notFoundYet")}
									</Typography>
								</Box>
							)}

							{/* Verify button */}
							<Button
								variant="outlined"
								size="medium"
								onClick={handleVerify}
								disabled={view === "verifying"}
								startIcon={
									view === "verifying" ? (
										<CircularProgress size={14} color="inherit" />
									) : undefined
								}
								sx={{
									px: 4,
									py: 1,
									fontWeight: 600,
									fontFamily: "Inter, sans-serif",
									fontSize: "0.875rem",
									textTransform: "none",
									color: status.info,
									borderColor: "rgba(88,166,255,0.4)",
									"&:hover": {
										borderColor: status.info,
										bgcolor: "rgba(88,166,255,0.08)",
									},
									"&.Mui-disabled": {
										color: neutral[400],
										borderColor: neutral[200],
									},
								}}
							>
								{view === "verifying"
									? t("donation.verifying")
									: t("donation.verify")}
							</Button>

							<Box sx={{ mt: 1 }}>
								<Button
									size="small"
									color="neutral"
									onClick={() => setView("input")}
									disabled={view === "verifying"}
								>
									← {t("donation.back")}
								</Button>
							</Box>
						</DialogContent>
					</>
				)}

			{/* ─── SUCCESS VIEW ───────────────────────────────────────────────── */}
			{view === "success" && (
				<>
					<DonationHeader
						subtitle={t("donation.thankYou")}
						displayName={displayName}
						onClose={handleClose}
					/>
					<DialogContent sx={{ px: 2.5, pt: 3, pb: 3, textAlign: "center" }}>
						<CheckCircleRounded
							sx={{ fontSize: 56, color: status.success, mb: 1.5 }}
						/>
						<Typography
							variant="h6"
							fontWeight={700}
							color={neutral[900]}
							fontFamily="Inter, sans-serif"
							mb={0.5}
						>
							{t("donation.paymentConfirmed")}
						</Typography>
						<Typography variant="body2" color={neutral[600]} mb={2}>
							{t("donation.paymentConfirmedDesc", { name: displayName })}
						</Typography>
						{!isInstalled && (
							<Typography variant="body2" color={neutral[500]} mb={2}>
								Installing in{" "}
								<Typography
									component="span"
									fontWeight={700}
									color={neutral[900]}
								>
									{countdown}s
								</Typography>
								…
							</Typography>
						)}
						{verifyTxId && (
							<Typography
								variant="caption"
								fontFamily="monospace"
								color={neutral[500]}
								sx={{
									display: "block",
									wordBreak: "break-all",
									fontSize: "0.7rem",
									mb: 2,
								}}
							>
								TX: {verifyTxId}
							</Typography>
						)}
						<Button variant="contained" color="success" onClick={handleClose}>
							{t("donation.close")}
						</Button>
					</DialogContent>
				</>
			)}
		</Dialog>
	);
};
