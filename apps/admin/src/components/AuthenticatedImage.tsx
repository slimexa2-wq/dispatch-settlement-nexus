import { useEffect, useState } from "react";
import { Image, Skeleton } from "antd";
import { api } from "../lib/api";

type Props = {
  imageId: string;
  alt: string;
  width?: number | string;
  height?: number | string;
};

export function AuthenticatedImage({ imageId, alt, width = "100%", height = 170 }: Props) {
  const [src, setSrc] = useState<string>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | undefined;
    let active = true;
    setSrc(undefined);
    setFailed(false);
    void api.download(`/project-images/${imageId}/content`)
      .then(({ blob }) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [imageId]);

  if (failed) return <div className="image-load-error" style={{ width, height }}>图片加载失败</div>;
  if (!src) return <Skeleton.Image active style={{ width, height }} />;
  return <Image src={src} alt={alt} width={width} height={height} style={{ objectFit: "cover" }} />;
}
