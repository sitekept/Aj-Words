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
      title="Synchroniser un autre appareil"
      onClose={onClose}
      footer={
        <>
          {link ? (
            <Button variant="secondary" icon={<Copy size={16} />} onClick={copyLink}>
              {copied ? "Lien copié" : "Copier le lien"}
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            Terminé
          </Button>
        </>
      }
    >
      <div className="sync-device">
        <p className="sync-device-intro">
          <Smartphone size={16} aria-hidden="true" /> Scannez ce code avec
          l&rsquo;appareil photo de votre téléphone pour y retrouver vos listes —
          sans compte, sans code à saisir. Le code ne sert qu&rsquo;une fois et
          expire au bout de quelques minutes.
        </p>

        {failed ? (
          <p className="field-error" role="alert">
            Impossible de créer un code d&rsquo;association. Vérifiez votre connexion et réessayez.
          </p>
        ) : link ? (
          <div className="sync-device-qr">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={toQrDataUrl(link.url)} alt="QR code d'association" width={192} height={192} />
            <code className="sync-device-code">{link.code}</code>
          </div>
        ) : (
          <p className="sync-device-loading" role="status">
            Création du code d&rsquo;association&hellip;
          </p>
        )}
      </div>
    </Modal>
  );
}
