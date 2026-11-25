"use client";

import { AlertTriangle, QrCode } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { formatBillingCurrency } from "@/lib/billing";

interface UpiQrCodeProps {
  upiUri: string;
  upiId: string;
  amount: number;
  invoiceNo: string;
}

export function UpiQrCode({ upiUri, upiId, amount, invoiceNo }: UpiQrCodeProps) {
  const [qrState, setQrState] = useState<{
    forUri: string;
    dataUrl: string | null;
    error: string | null;
  }>({ forUri: "", dataUrl: null, error: null });

  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(upiUri, {
      width: 240,
      margin: 2,
      errorCorrectionLevel: "M",
      color: {
        dark: "#0f172a",
        light: "#ffffff",
      },
    })
      .then((url) => {
        if (active) setQrState({ forUri: upiUri, dataUrl: url, error: null });
      })
      .catch(() => {
        if (active) {
          setQrState({
            forUri: upiUri,
            dataUrl: null,
            error: "Could not generate UPI QR code.",
          });
        }
      });

    return () => {
      active = false;
    };
  }, [upiUri]);

  const dataUrl = qrState.forUri === upiUri ? qrState.dataUrl : null;
  const qrError = qrState.forUri === upiUri ? qrState.error : null;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-center print:border-slate-300 print:bg-white">
      <div className="flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        <QrCode size={14} aria-hidden="true" />
        <span>Scan to pay via UPI</span>
      </div>

      <div className="mt-3 flex justify-center">
        {dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={dataUrl}
            alt={`UPI QR code to pay ${formatBillingCurrency(amount)} to ${upiId} for ${invoiceNo}`}
            width={176}
            height={176}
            className="h-44 w-44 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xs"
          />
        ) : qrError ? (
          <p role="alert" className="text-xs text-rose-600">
            {qrError}
          </p>
        ) : (
          <div
            className="h-44 w-44 animate-pulse rounded-lg border border-slate-200 bg-slate-100"
            role="status"
            aria-label="Generating UPI QR code"
          />
        )}
      </div>

      <p className="mt-2.5 text-xs font-medium text-slate-800">{upiId}</p>
      <p className="mt-0.5 text-[11px] text-slate-500">
        {formatBillingCurrency(amount)} · {invoiceNo}
      </p>

      <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-left text-[11px] leading-4 text-amber-900 print:hidden">
        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-700" aria-hidden="true" />
        <p>
          A UPI QR cannot confirm that payment arrived. Verify the payment in your UPI app or bank
          notification before marking this bill as paid.
        </p>
      </div>
    </div>
  );
}
