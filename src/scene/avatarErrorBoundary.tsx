import React, { Component, ReactNode } from 'react';
import { AvatarConfig, WorkerId } from '../workers/worker.types';

/**
 * Isolated Avatar Model Error Boundary & Fallback Resolver (Fix B)
 *
 * Ensures that:
 * 1. Each worker avatar's GLB model loading is wrapped in its own isolated Error Boundary.
 * 2. If a worker's `modelUrl` is missing, invalid, or fails to load, ONLY that worker
 *    falls back to its `ArticulatedHumanoidPlaceholder` while preserving its
 *    `fallbackType`, `accentColor`, `modelUrl`, and `animationMap` configuration.
 * 3. Other worker avatars and the `OfficeScene` continue rendering without crashing.
 * 4. Failed model URLs are recorded so the component never enters an infinite reload loop.
 */

export type AvatarRenderMode = 'placeholder' | 'glb' | 'fallback-after-error';

export interface AvatarRenderResolution {
  mode: AvatarRenderMode;
  activeModelUrl: string | null;
  fallbackType: AvatarConfig['fallbackType'];
  accentColor: string;
  animationMap: AvatarConfig['animationMap'];
  errorDetail: string | null;
}

export function isValidGlbModelUrl(url: string | null | undefined): url is string {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (trimmed.length === 0) return false;
  return /\.(glb|gltf)(\?.*)?$/i.test(trimmed);
}

/**
 * Pure resolver determining whether a worker should render its GLB model,
 * default placeholder (`modelUrl === null`), or fallback placeholder after an error.
 */
export function resolveAvatarRenderMode(
  workerId: WorkerId,
  avatarConfig: AvatarConfig,
  failedErrorsByWorker: Record<string, string | undefined>,
): AvatarRenderResolution {
  const existingError = failedErrorsByWorker[workerId] ?? null;

  if (!avatarConfig.modelUrl) {
    return {
      mode: 'placeholder',
      activeModelUrl: null,
      fallbackType: avatarConfig.fallbackType,
      accentColor: avatarConfig.accentColor,
      animationMap: avatarConfig.animationMap,
      errorDetail: null,
    };
  }

  if (existingError) {
    return {
      mode: 'fallback-after-error',
      activeModelUrl: null,
      fallbackType: avatarConfig.fallbackType,
      accentColor: avatarConfig.accentColor,
      animationMap: avatarConfig.animationMap,
      errorDetail: existingError,
    };
  }

  if (!isValidGlbModelUrl(avatarConfig.modelUrl)) {
    return {
      mode: 'fallback-after-error',
      activeModelUrl: null,
      fallbackType: avatarConfig.fallbackType,
      accentColor: avatarConfig.accentColor,
      animationMap: avatarConfig.animationMap,
      errorDetail: `Invalid GLB/glTF URL format: "${avatarConfig.modelUrl}"`,
    };
  }

  return {
    mode: 'glb',
    activeModelUrl: avatarConfig.modelUrl,
    fallbackType: avatarConfig.fallbackType,
    accentColor: avatarConfig.accentColor,
    animationMap: avatarConfig.animationMap,
    errorDetail: null,
  };
}

interface AvatarModelErrorBoundaryProps {
  workerId: WorkerId;
  workerName: string;
  modelUrl: string;
  fallback: ReactNode;
  onModelError?: (workerId: WorkerId, modelUrl: string, errorMessage: string) => void;
  children: ReactNode;
}

interface AvatarModelErrorBoundaryState {
  failedModelUrl: string | null;
  errorMessage: string | null;
}

export class AvatarModelErrorBoundary extends Component<
  AvatarModelErrorBoundaryProps,
  AvatarModelErrorBoundaryState
> {
  override state: AvatarModelErrorBoundaryState = {
    failedModelUrl: null,
    errorMessage: null,
  };

  static getDerivedStateFromError(error: unknown): Partial<AvatarModelErrorBoundaryState> {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      errorMessage: msg,
    };
  }

  static getDerivedStateFromProps(
    props: AvatarModelErrorBoundaryProps,
    state: AvatarModelErrorBoundaryState,
  ): Partial<AvatarModelErrorBoundaryState> | null {
    // Only reset error state if the user explicitly provides a different modelUrl
    if (state.failedModelUrl && props.modelUrl !== state.failedModelUrl) {
      return {
        failedModelUrl: null,
        errorMessage: null,
      };
    }
    return null;
  }

  override componentDidCatch(error: unknown): void {
    const msg = error instanceof Error ? error.message : String(error);
    this.setState({
      failedModelUrl: this.props.modelUrl,
      errorMessage: msg,
    });

    // Diagnostic log during development (never silently hidden)
    console.warn(
      `[SIREADER Avatar Fallback] Failed to load GLB model "${this.props.modelUrl}" for worker "${this.props.workerName}" (${this.props.workerId}). Falling back to ${'articulated-humanoid'} placeholder. Reason: ${msg}`,
    );

    if (this.props.onModelError) {
      this.props.onModelError(this.props.workerId, this.props.modelUrl, msg);
    }
  }

  override render(): ReactNode {
    const hasFailedForCurrentUrl =
      this.state.errorMessage !== null &&
      (this.state.failedModelUrl === null ||
        this.state.failedModelUrl === this.props.modelUrl);

    if (hasFailedForCurrentUrl) {
      return this.props.fallback;
    }

    return this.props.children;
  }
}
