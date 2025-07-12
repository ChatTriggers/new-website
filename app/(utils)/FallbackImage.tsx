"use client";

import Image, { type ImageProps } from "next/image";
import { useState } from "react";

interface Props extends ImageProps {
  fallbackSrc?: ImageProps["src"];
}

export default function FallbackImage(props: Props) {
  const [isError, setIsError] = useState(false);
  const [isFallbackError, setIsFallbackError] = useState(false);

  if (isFallbackError) {
    return (
      <div
        style={{
          width: props.width,
          height: props.height,
        }}
      />
    );
  }

  if (isError && props.fallbackSrc) {
    return <Image {...props} onError={() => setIsFallbackError(true)} src={props.fallbackSrc} />;
  }

  return (
    <Image
      {...props}
      onError={() => {
        setIsError(true);
        if (!props.fallbackSrc) {
          setIsFallbackError(true);
        }
      }}
    />
  );
}
