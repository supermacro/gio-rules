import { CloudDownloadOutlined, CloudUploadOutlined } from '@ant-design/icons';
import { Button, Tooltip, message } from 'antd';
import React, { useRef } from 'react';

import { decisionModelSchema } from '../../../helpers/schema';
import { useDecisionGraphActions, useDecisionGraphRaw, useDecisionGraphState } from '../context/dg-store.context';
import { type DecisionEdge, type DecisionNode } from '../dg-types';

const DecisionContentType = 'application/vnd.gorules.decision';

export type GraphSideToolbarProps = {
  //
};

export const GraphSideToolbar: React.FC<GraphSideToolbarProps> = () => {
  const decisionGraphRaw = useDecisionGraphRaw();
  const fileInput = useRef<HTMLInputElement>(null);

  const { setDecisionGraph, setActivePanel } = useDecisionGraphActions();
  const { disabled, panels, activePanel, viewConfig } = useDecisionGraphState(
    ({ disabled, panels, activePanel, viewConfig }) => ({
      disabled,
      panels,
      activePanel,
      viewConfig,
    }),
  );

  const handleUploadInput = async (event: any) => {
    const fileList = event?.target?.files as FileList;
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const parsed: any = JSON.parse(e?.target?.result as string);
        if (parsed?.contentType !== DecisionContentType) {
          throw new Error('Invalid content type');
        }

        const nodes: DecisionNode[] = Array.isArray(parsed?.nodes) ? parsed.nodes : [];
        const nodeIds = nodes.map((node) => node.id);

        const edges: DecisionEdge[] = (parsed.edges as DecisionEdge[]).filter(
          (edge) => nodeIds.includes(edge?.targetId) && nodeIds.includes(edge?.sourceId),
        );

        const modelParsed = decisionModelSchema.safeParse({
          nodes,
          edges,
          settings: parsed?.settings,
        });

        if (!modelParsed.success) {
          console.log(modelParsed.error?.message);
          message.error(modelParsed.error?.message);
          return;
        }

        setDecisionGraph(modelParsed.data);
      } catch (e: any) {
        message.error(e.message);
      }
    };

    reader.readAsText(Array.from(fileList)?.[0], 'UTF-8');
  };

  const downloadJDM = async () => {
    try {
      const { name, decisionGraph } = decisionGraphRaw.stateStore.getState();
      // create file in browser
      const fileName = `${name.replaceAll('.json', '')}.json`;
      const json = JSON.stringify(
        {
          contentType: DecisionContentType,
          nodes: decisionGraph.nodes,
          edges: decisionGraph.edges,
        },
        null,
        2,
      );
      const blob = new Blob([json], { type: 'application/json' });
      const href = URL.createObjectURL(blob);

      // create "a" HTLM element with href to file
      const link = window.document.createElement('a');
      link.href = href;
      link.download = fileName;
      window.document.body.appendChild(link);
      link.click();

      // clean up "a" element & remove ObjectURL
      window.document.body.removeChild(link);
      URL.revokeObjectURL(href);
    } catch (e: any) {
      message.error(e.message);
    }
  };

  return (
    <div className={'grl-dg__aside'}>
      <input
        hidden
        accept='application/json'
        type='file'
        ref={fileInput}
        onChange={handleUploadInput}
        onClick={(event) => {
          (event.target as any).value = null;
        }}
      />
      <div className={'grl-dg__aside__side-bar'}>
        <div className={'grl-dg__aside__side-bar__top'}>
          {!disabled && !viewConfig?.enabled && (
            <Tooltip title='Upload JSON' placement='right'>
              <Button type='text' icon={<CloudUploadOutlined />} onClick={() => fileInput.current?.click()} />
            </Tooltip>
          )}
          {!viewConfig?.enabled && (
            <Tooltip title='Download JSON' placement='right'>
              <Button type='text' icon={<CloudDownloadOutlined />} onClick={downloadJDM} />
            </Tooltip>
          )}
        </div>
        <div className={'grl-dg__aside__side-bar__bottom'}>
          {(panels || []).map((panel) => {
            const isActive = activePanel === panel.id;
            return (
              <Tooltip
                key={panel.id}
                title={`${!isActive ? 'Open' : 'Close'} ${panel.title.toLowerCase()} panel`}
                placement={'right'}
              >
                <Button
                  key={panel.id}
                  type='text'
                  icon={panel.icon}
                  style={{ background: isActive ? 'rgba(0, 0, 0, 0.1)' : undefined }}
                  onClick={() => {
                    if (panel?.onClick) return panel.onClick();
                    if (panel?.renderPanel) setActivePanel(isActive ? undefined : panel.id);
                  }}
                />
              </Tooltip>
            );
          })}
        </div>
      </div>
    </div>
  );
};
