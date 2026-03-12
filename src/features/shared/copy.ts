export const COPY = {
  actions: {
    importWorkbook: "导入工作簿",
    loadCurrentSheet: "载入当前工作表",
    refreshPreview: "刷新预览",
    exportXlsx: "导出 XLSX",
    exportCsv: "导出 CSV",
    copyCsv: "复制 CSV",
    executeBatch: "执行批量处理",
    executePrint: "执行打印",
    generatePreview: "生成预览"
  },
  empty: {
    batchRunHint: "选择文件和输出目录后执行批量处理。",
    printPreviewMissing: "尚未生成预览。",
    workbookSheetsHint: "导入工作簿后，这里会列出所有工作表。"
  },
  confirm: {
    batchRunTitle: "确认执行批量处理？",
    batchRunDescription: "将按当前规则链写入输出目录，若同名文件已存在可能被覆盖。",
    confirm: "确认执行",
    cancel: "取消"
  },
  status: {
    ready: "准备就绪，可以先导入工作簿或直接粘贴表格数据。",
    importedWorkbook: (fileName: string) => `已导入 ${fileName}，可载入工作表。`,
    needImportWorkbook: "请先导入工作簿。",
    loadedSheet: (sheetName: string) => `已载入工作表 ${sheetName}。`,
    refreshedPreview: "已根据当前文本刷新预览。",
    appliedColumnRule: "列规则已应用。",
    appliedRuleChain: (steps: number) => `规则链已应用，共 ${steps} 步。`,
    addedRuleToChain: (ruleDesc: string) => `已加入规则链：${ruleDesc}。`,
    dedupeDone: "重复值处理完成。",
    splitDone: "分列完成。",
    mergeDone: "合并列完成。",
    noCsvToCopy: "当前没有可复制的结果。",
    copiedCsv: "已复制 CSV 到剪贴板。",
    exportedFile: (path: string) => `已导出到 ${path}。`,
    selectedBatchFiles: (count: number) => `已选择 ${count} 个批量文件。`,
    selectedBatchOutputDir: "已选择批量输出目录。",
    needBatchFiles: "请先选择批量文件。",
    needBatchOutputDir: "请先选择输出目录。",
    needDataBeforeBatch: "请先载入数据，让系统知道要匹配的列名。",
    batchDone: (processed: number, failed: number) => `批量处理完成，成功 ${processed} 个，失败 ${failed} 个。`,
    loanDone: "月供计算完成。",
    loanScheduleDone: "已生成贷款摊还表。",
    npvDone: "净现值计算完成。",
    sensitivityDone: "已生成净现值敏感性分析表。",
    irrDone: "IRR 计算完成。",
    needFinanceTable: "请先生成财务结果表。",
    financeLoadedToCleaning: "财务结果表已载入清洗区。",
    printPreviewDone: "打印预览已生成。",
    printRequestDone: "已执行打印请求。"
  },
  cleaning: {
    panelTitle: "数据清洗工作台",
    panelSubtitle: "先处理输入，再按需展开高级规则。",
    rawLabel: "表格内容",
    rawPlaceholder: "姓名\t部门\t地区",
    delimiterLabel: "分隔符",
    delimiterOptions: [
      { value: "tab", label: "Tab" },
      { value: ",", label: "逗号" },
      { value: ";", label: "分号" },
      { value: "|", label: "竖线" }
    ],
    firstRowLabel: "首行类型",
    headerCheckbox: "首行是表头",
    operationLabel: "操作",
    mini: {
      currentColumn: "当前列绑定",
      currentColumnFallback: "等待识别",
      ruleChain: "规则链",
      ruleChainFallback: "未配置",
      dataSize: "当前数据量",
      dataSizeFallback: "未预览",
      dataSizeValue: (rows: number, cols: number) => `${rows} 行 / ${cols} 列`
    },
    advancedTitle: "高级清洗操作",
    advancedSubtitle: "按需展开对应面板，避免一次看到过多设置。",
    sections: {
      columnRule: "列规则",
      dedupe: "重复值处理",
      split: "分列",
      merge: "合并列",
      ruleChain: "规则链面板"
    },
    labels: {
      targetColumn: "目标列",
      ruleType: "规则类型",
      fillValue: "填充值",
      decimals: "保留小数位",
      splitBy: "拆分符",
      joinBy: "连接符",
      newColumnName: "新列名称"
    },
    ruleTypeOptions: [
      { value: "trim", label: "去首尾空格" },
      { value: "uppercase", label: "转大写" },
      { value: "lowercase", label: "转小写" },
      { value: "fill-empty", label: "空值填充" },
      { value: "format-number", label: "数字格式化" }
    ],
    actions: {
      addRule: "加入规则链",
      applyCurrentRule: "应用当前规则",
      applyRuleChain: "应用规则链",
      executeDedupe: "执行去重",
      executeSplit: "执行分列",
      executeMerge: "执行合并",
      clearRuleChain: "清空",
      moveUp: "上移",
      moveDown: "下移",
      remove: "删除"
    },
    dedupeAllRows: "整行",
    mergeColumnHint: "载入数据后可按列名勾选。",
    ruleChainEmpty: "尚未添加规则，批处理会回退到当前单步规则。",
    resultTitle: "处理结果",
    resultSubtitle: "预览清洗后的表格数据。",
    resultFallback: "先刷新预览或执行清洗动作。",
    resultEmptyText: "等待生成结果"
  },
  finance: {
    sections: {
      loan: {
        title: "贷款月供 PMT",
        subtitle: "同时支持输出完整摊还表。",
        labels: {
          principal: "本金",
          annualRate: "年利率 (%)",
          years: "年限",
          paymentsPerYear: "每年还款次数"
        },
        actions: {
          calculate: "计算月供",
          generateSchedule: "生成摊还表"
        }
      },
      npv: {
        title: "净现值 NPV",
        subtitle: "支持输出敏感性分析表。",
        labels: {
          rate: "贴现率 (%)",
          investment: "初始投资",
          cashflows: "现金流（逗号分隔）"
        },
        actions: {
          calculate: "计算 NPV",
          generateSensitivity: "生成敏感性表"
        }
      },
      irr: {
        title: "内部收益率 IRR",
        subtitle: "给出收益率与迭代次数。",
        labels: {
          cashflows: "现金流（首项通常为负）",
          guess: "初始猜测 (%)"
        },
        actions: {
          calculate: "计算 IRR"
        }
      }
    },
    result: {
      title: "财务结果表",
      subtitle: "可继续导入到数据清洗区进行后续加工。",
      loadToCleaning: "载入到清洗区",
      summaryFallback: "先生成摊还表或敏感性分析表。",
      tableEmpty: "等待财务结果"
    }
  }
} as const;



