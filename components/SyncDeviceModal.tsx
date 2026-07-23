"use client";

import { useEffect, useState } from "react";
import qrcode from "qrcode-generator";
import { Copy, Smartphone } from "lucide-react";

import { Button, Modal } from "@/components/ui";
import type { PairingLink } from "@/lib/device-pairing";

// A short pairing URL → a scannable QR as a data URL. "M" error correction is a
// good balance for a short string; cellSize/margin keep it crisp on phones.
const toQrDataUrl = (text: string): string => {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return qr.createDataURL(6, 4);
};

interface SyncDeviceModalProps {
  open: boolean;
  onClose: () => void;
  makePairingLink: () => Promise<PairingLink | null>;
}

export function SyncDeviceModal({
  open,
  onClose,
  makePairingLink
}: SyncDeviceModalProps) {
  const [link, setLink] = useState<PairingLink | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) {
      setLink(null);
      setFailed(false);
      setCopied(false);
      return;
    }

    let active = true;
    makePairingLink()
      .then((result) => {
        if (!active) {
          return;
        }
        if (result) {
          setLink(result);
        } else {
          setFailed(true);
        }
      })
      .catch(() => {
        if (active) {
          setFailed(true);
        }
      });

    return () => {
      active = false;
    };
  }, [open, makePairingLink]);

  const copyLink = async () => {
    if (!link) {
      return;
    }
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Sync another device"
      onClose={onClose}
      footer={
        <>
          {link ? (
            <Button variant="secondary" icon={<Copy size={16} />} onClick={copyLink}>
              {copied ? "Link copied" : "Copy link"}
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <div className="sync-device">
        <p className="sync-device-intro">
          <Smartphone size={16} aria-hidden="true" /> Scan this code with your
          phone&rsquo;s camera to bring your lists onto it — no login, no code to
          type. The code works once and expires in a few minutes.
        </p>

        {failed ? (
          <p className="field-error" role="alert">
            Could not create a pairing code. Check your connection and try again.
          </p>
        ) : link ? (
          <div className="sync-device-qr">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={toQrDataUrl(link.url)} alt="Pairing QR code" width={192} height={192} />
            <code className="sync-device-code">{link.code}</code>
          </div>
        ) : (
          <p className="sync-device-loading" role="status">
            Preparing a pairing code&hellip;
          </p>
        )}
      </div>
    </Modal>
  );
}
