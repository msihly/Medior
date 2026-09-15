import { getCurrentWindow } from "@electron/remote";
import { Component, ErrorInfo, ReactNode } from "react";
import { Button, Modal, Text } from "medior/components";

interface MediaTransformerErrorBoundaryProps {
  children: ReactNode;
  onClose: () => void;
}

export class MediaTransformerErrorBoundary extends Component<
  MediaTransformerErrorBoundaryProps,
  { error: Error }
> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Media Transformer render failed:", error, info.componentStack);
  }

  openDevTools = () => getCurrentWindow().webContents.openDevTools();

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <Modal.Container onClose={this.props.onClose} width="45rem">
        <Modal.Header>
          <Text preset="title">{"Media Transformer could not be displayed"}</Text>
        </Modal.Header>

        <Modal.Content>
          <Text whiteSpace="pre-wrap">{this.state.error.message}</Text>

          <Text>
            {"Open DevTools for the error details, or close this window to return to Medior."}
          </Text>
        </Modal.Content>

        <Modal.Footer>
          <Button text="Open DevTools" icon="Code" onClick={this.openDevTools} />

          <Button text="Close" icon="Close" onClick={this.props.onClose} />
        </Modal.Footer>
      </Modal.Container>
    );
  }
}
