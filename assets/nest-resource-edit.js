
export function createNestEditing(h, ref, watch, Button, NumberInput, Modal, message) {
  function apply(nestId, change, reload) {
    try {
      window.webcamPreview.updateNest(nestId, change);
      reload();
    } catch (error) {
      message.error(error.message);
      throw error;
    }
  }

  const PartActions = {
    props: ['nestId', 'part', 'editing'],
    emits: ['reload'],
    setup(props, { emit }) {
      function edit() {
        const draft = ref({ serialNo: props.part.serialNo, quantity: props.part.quantity ?? 1 });
        Modal.confirm({
          title: '编辑零件',
          icon: null,
          okText: '保存',
          cancelText: '取消',
          content: () => h('div', { class: 'nest-part-edit-fields' }, [
            h('label', null, ['零件编号', h('input', { class: 'ant-input',
              value: draft.value.serialNo,
              onInput: event => draft.value.serialNo = event.target.value,
              'aria-label': '零件编号',
              maxlength: 100
            })]),
            h('label', null, ['数量', h('input', { class: 'ant-input', type: 'number',
              value: draft.value.quantity,
              onInput: event => draft.value.quantity = event.target.valueAsNumber,
              min: 1, precision: 0, 'aria-label': '数量'
            })])
          ]),
          onOk: () => {
            try {
              apply(props.nestId, { partId: props.part.id, fields: draft.value }, () => emit('reload'));
            } catch (error) {
              return Promise.reject(error);
            }
          }
        });
      }
      function remove() {
        Modal.confirm({
          title: '删除零件',
          content: '确认从当前套料中删除“' + props.part.serialNo + '”？',
          okText: '删除',
          cancelText: '取消',
          onOk: () => apply(props.nestId, { deletePartId: props.part.id }, () => emit('reload'))
        });
      }
      return () => props.editing ? h('span', { class: 'nest-part-edit-actions', onClick: event => event.stopPropagation() }, [
        h(Button, { type: 'link', size: 'small', onClick: edit, 'aria-label': '编辑零件 ' + props.part.serialNo }, { default: () => '编辑' }),
        h(Button, { type: 'link', size: 'small', danger: true, onClick: remove, 'aria-label': '删除零件 ' + props.part.serialNo }, { default: () => '删除' })
      ]) : null;
    }
  };

  const LengthField = {
    props: ['nestId', 'length'],
    emits: ['reload'],
    setup(props, { emit }) {
      const value = ref(props.length);
      watch(() => [props.nestId, props.length], () => { value.value = props.length; });
      return () => h('span', { class: 'nest-length-edit' }, [
        h(NumberInput, {
          value: value.value, 'onUpdate:value': next => value.value = next,
          min: 1, precision: 2, size: 'small', 'aria-label': '型材长度'
        }),
        h(Button, {
          type: 'link', size: 'small',
          onClick: () => { try { apply(props.nestId, { rawLength: value.value }, () => emit('reload')); } catch {} }
        }, { default: () => '保存' })
      ]);
    }
  };
  return { PartActions, LengthField };
}

