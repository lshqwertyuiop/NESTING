
(() => {
  const profile = {id:'hp340',name:'HP_340x12'};
  const catalog = {
    H1234: {'1区':['345','346'],'2区':['351','352']},
    H1235: {'1区':['345','347'],'2区':['361','362']}
  };
  const flows=['CPX','CPZ'];
  const lengths=[1850,2410,3250,2870,3980,4650,3520,2140,3060];
  const parts=[];
  const node=(id,nodeName,nodeLevel,parentId,children,extra={})=>({
    id,key:id,nodeName,nodeLevel,parentId,pieceId:null,children,...extra
  });
  const tree=Object.entries(catalog).map(([shipNo,areas],shipIndex)=>{
    const shipId=shipNo;
    const blockNodes=Object.entries(areas).flatMap(([areaCode,blocks],areaIndex)=>
      blocks.map((blockNo,blockIndex)=>{
        const blockId=shipId+'-'+areaCode+'-'+blockNo;
        const flowNodes=flows.map((workingLocation,flowIndex)=>{
          const flowId=blockId+'-'+workingLocation;
          const leaves=Array.from({length:3},(_,index)=>{
            const id=flowId+'-'+String(index+1).padStart(3,'0');
            const length=lengths[(shipIndex+areaIndex*2+blockIndex*3+flowIndex*2+index)%lengths.length];
            const quantity=3+index;
            const nestedNum=index===0&&flowIndex===1?quantity:index===1?2:0;
            const part={id,pieceId:id,serialNumber:id,name:id,partName:id,nodeName:id,
              replacedOnImport:id==='H1234-1区-345-CPX-002',
              profile,profileId:profile.id,profileName:profile.name,quality:'AH32',
              length,tLength:length,count:quantity,quantity,nestedNum,shipNo,areaCode,blockNo,blockId,workingLocation,
              palletNo:'TP-'+blockNo+'-'+workingLocation,
              createTime:'2026-11-'+String(2+shipIndex+areaIndex+blockIndex+index).padStart(2,'0')+' '+(flowIndex?'14:30':'09:15')+':00',
              nestStatus:nestedNum===quantity?'已套料':nestedNum?'部分套料':'未套料'};
            parts.push(part);
            return {...part,key:id,parentId:flowId,nodeLevel:4,children:[],
              payload:{dimension:profile.name,length}};
          });
          return node(flowId,workingLocation,3,blockId,leaves,{levelType:'workingLocation'});
        });
        return node(blockId,blockNo,2,shipId,flowNodes,{levelType:'blockNo',areaCode});
      })
    );
    return node(shipId,shipNo,1,'root',blockNodes,{levelType:'shipNo'});
  });
  const names=['nestingManagement','nestManagement','nestManagementIndex','partConfig','nestingResult','taskManagement','materialResource'];
  const fixtures={
    '/configuration/projectName':'STANDARD', '/version':'演示',
    '/user/userInfo':{id:'demo',name:'演示用户',userName:'演示用户',workNo:'OP0410',roleIdList:['demo']},
    '/role/getRole':{id:'demo',name:'演示角色',permissionDefinitionRecordList:names.map(name=>({name}))},
    '/pieceCatalog/tree':tree, '/pieceCatalog/catalogTree':tree,
    '/profile/queryAll':[profile], '/profileType/list':[], '/profile/qualitys':['AH32'],
    '/profile/quality/options':[{label:'AH32',value:'AH32'}],
    '/customNest/configInfo':{}, '/nestLib/defaultSeqId':'00001',
    '/nestLib/pageList':{count:0,data:[]},
    '/consumable/queryEarlyWarn':[], '/consumable/torchMonitor':[], '/scene/info':{}, '/workStation/info':{}
  };

  const unfoldedProfile = {id:'cu30090',name:'CU 300+90'};
  fixtures['/profile/queryAll'].push(unfoldedProfile);
  let resourceRows = [
    ['P110K-74','032','00001',12000,[3520,2400,5600]],
    ['P110K-74','051','00001',10000,[5100,3900]],
    ['H1234','345','00001',12000,[1850,2410,3250],'1区','CPX'],
    ['H1234','346','00001',10000,[2870,3980]]
  ].map(([shipNo,blockNo,sequence,rawLength,lengths,areaCode,workingLocation],index)=>{
    const serialNo=shipNo+'-'+(areaCode||blockNo)+'-'+sequence;
    const usedLength=lengths.reduce((sum,length)=>sum+length,0)+(lengths.length+1)*10;
    const nestDto={serialNo,shipNo,blockNo,areaCode,workingLocation,quality:'AH32',certificate:'CCS',steelNumber:'DEMO-'+blockNo+'-'+sequence,
      profile:{dimension:profile.name,rawLength,usedLength,restLength:rawLength-usedLength,flangeHeight:340,edgeDistance:10,partClearance:10,bevelPartClearance:10},
      parts:lengths.map((length,index)=>({id:serialNo+'-'+(index+1),index:index+1,blockName:blockNo,serialNo:blockNo+'-S'+(106+index),length,quantity:1,workingLocation:workingLocation??'',
        macros:[{originDistance:0,serialNo:'',webBevelType:0},{originDistance:length,serialNo:'',webBevelType:0}]}))};
    return {id:serialNo,serialNo,nestDto,updateTime:'2026-11-07 10:'+String(15+index*5)+':00',nestType:'NEST',craftParseStatus:2,planStatus:2};
  });
  const unfoldedId = 'CU-311P-35';
  resourceRows.push({
    id:unfoldedId,serialNo:unfoldedId,replacedOnImport:true,updateTime:'2026-11-07 11:00:00',nestType:'NEST',craftParseStatus:2,planStatus:2,
    nestDto:{
      serialNo:unfoldedId,shipNo:'P110K-74',blockNo:'032',
      unfoldedSvg:'./assets/CU-311P-35-unfolded.svg',
      profile:{dimension:unfoldedProfile.name,rawLength:8000,flangeHeight:390,restLength:null},
      parts:[
        {id:'faa5d469-fdd7-4042-ad6b-7161aea92687',serialNo:'311S-CFR246E-S1',replacedOnImport:true,start:2317.87988,end:5146.43994},
        {id:'7731ebed-15f3-4694-98a6-a3f5dfa6272d',serialNo:'311P-CFR246E-S1',start:5161.43994,end:7990},
      ].map(({end,...part},index)=>({...part,index:index+1,blockName:'032',length:Number((end-part.start).toFixed(2)),macros:[]})),
    },
  });
  function resourceGroup(row) {
    const {shipNo,blockNo,areaCode,workingLocation}=row.nestDto;
    const type=areaCode?'areaCode':'blockNo';
    const code=areaCode||blockNo;
    const flow=workingLocation??'';
    return {shipNo,type,code,flow,path:[shipNo,type,code,flow].map(encodeURIComponent).join(':')};
  }
  function resourceTree(filter) {
    const ships=new Map();
    const groups=new Map();
    const flowNodes=new Map();
    for(const row of resourceRows){
      if(!matchesResource(row,filter.nodeName))continue;
      const {shipNo,type,code,flow,path}=resourceGroup(row);
      if(!ships.has(shipNo))ships.set(shipNo,{nodeName:shipNo,path:encodeURIComponent(shipNo),levelType:'shipNo',children:[]});
      const groupPath=[shipNo,type,code].map(encodeURIComponent).join(':');
      if(!groups.has(groupPath)){
        const group={nodeName:code,path:groupPath,levelType:type,children:[]};
        ships.get(shipNo).children.push(group);
        groups.set(groupPath,group);
      }
      if(!flowNodes.has(path)){
        const node={nodeName:flow||'空类型',path,levelType:'workingLocation',children:[],replacementRows:[]};
        groups.get(groupPath).children.push(node);
        flowNodes.set(path,node);
      }
      if(row.replacedOnImport){
        const {id,updateTime,replacementVersion}=row;
        flowNodes.get(path).replacementRows.push({id,updateTime,replacementVersion,replacedOnImport:true});
      }
    }
    return [...ships.values()];
  }
  function matchesResource(row,query='') {
    return row.serialNo.toLowerCase().includes(String(query??'').trim().toLowerCase());
  }
  const jsonUrl=data=>'data:application/json,'+encodeURIComponent(JSON.stringify(data));
  function resourceDetails(id) {
    const row=resourceRows.find(row=>row.id===id);
    if(!row) return null;
    if(row.nestDto.importedNest) return row;
    if(row.nestDto.unfoldedSvg) return {...row,workOrderNo:'DEMO-'+row.nestDto.blockNo};
    const length=row.nestDto.profile.rawLength;
    const points=[[0,0,0],[length,0,0],[length,340,0],[0,340,0],[0,0,12],[length,0,12],[length,340,12],[0,340,12]];
    const triangles=[[0,1,2],[0,2,3],[4,6,5],[4,7,6],[0,4,5],[0,5,1],[1,5,6],[1,6,2],[2,6,7],[2,7,3],[3,7,4],[3,4,0]];
    return {...row,workOrderNo:'DEMO-'+row.nestDto.blockNo,
      workpieceData:jsonUrl({mesh:{vertices:points.map(([x,y,z])=>({x,y,z})),faces:triangles.map(vertex_indices=>({vertex_indices})),normal:[]}}),
      geomotryData:jsonUrl({parts:[]}),
      processData:'/mock-files/production-execution/process.json'};
  }
  function updateNest(id,change){
    const row=resourceRows.find(item=>item.id===id);
    if(!row)throw new Error('套料记录不存在');
    const nest=structuredClone(row.nestDto);
    if(change.fields){
      const part=nest.parts.find(item=>item.id===change.partId);
      if(!part)throw new Error('零件不存在');
      const serialNo=String(change.fields.serialNo??'').trim();
      const quantity=change.fields.quantity;
      if(!serialNo)throw new Error('请输入零件编号');
      if(!Number.isInteger(quantity)||quantity<1)throw new Error('数量须为大于零的整数');
      part.serialNo=serialNo;
      part.quantity=quantity;
    }
    if(change.deletePartId){
      nest.parts=nest.parts.filter(part=>part.id!==change.deletePartId);
      nest.parts.forEach((part,index)=>{part.index=index+1});
      delete nest.unfoldedSvg;
    }
    if(change.rawLength!==undefined){
      const length=change.rawLength;
      let cursor=nest.profile.edgeDistance??10;
      let occupied=0;
      for(const part of nest.parts){
        const end=part.end??((part.start??cursor)+part.length);
        occupied=Math.max(occupied,end);
        cursor=end+(nest.profile.partClearance??10);
      }
      const minLength=occupied+(nest.profile.edgeDistance??10);
      if(!Number.isFinite(length)||length<=0||length<minLength)throw new Error('型材长度至少为 '+minLength.toFixed(2)+' mm');
      nest.profile.rawLength=length;
      nest.profile.usedLength=occupied;
      nest.profile.restLength=length-occupied;
    }
    if(row.replacedOnImport)row.replacementVersion??=row.updateTime;
    row.nestDto=nest;
    row.updateTime=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',dateStyle:'short',timeStyle:'medium'}).format(new Date());
  }
  const requests=[];
  const filterLabels={shipNo:'船号',areaCode:'区号',blockNo:'分段号',workingLocation:'类型',palletNo:'托盘号',nestStatus:'套料状态'};
  const filterOptions=()=>Object.fromEntries(Object.entries(filterLabels).map(([field,label])=>[
    field,{label,values:[...new Set(parts.map(part=>part[field]))].sort()}
  ]));
  function filterPartTree(nodes,filters) {
    return nodes.flatMap(node=>{
      if(node.pieceId){
        const matches=Object.keys(filterLabels).every(field=>!filters[field]||node[field]===filters[field]);
        const search=String(filters.nestNo??'').trim().toLowerCase();
        const created=String(node.createTime??'').replace(' ','T');
        const from=filters.createdFrom;
        const to=filters.createdTo;
        const withinTime=(!from||(created&&created>=from))&&
          (!to||(created&&created<=to+':59.999'));
        return matches&&withinTime&&node.serialNumber.toLowerCase().includes(search)?[node]:[];
      }
      const children=filterPartTree(node.children,filters);
      return children.length?[{...node,children}]:[];
    });
  }
  const initialParts=parts.filter(part=>part.shipNo==='H1234'&&part.blockNo==='345'&&part.workingLocation==='CPX');
  function availablePart(part) {
    const remaining=part.quantity-part.nestedNum;
    return {...part,totalQuantity:part.quantity,quantity:remaining,remainingQuantity:remaining};
  }
  let selected=initialParts;
  let batchNo='H1234-345-00001';
  function report() {
    const rawLength=12000;
    const gap=10;
    const nests=[];
    for (const part of selected) {
      let nest=nests.find(item=>item.usedLength+part.length+gap<=rawLength);
      if(!nest){
        nest={id:'M-'+(nests.length+1),no:batchNo+'-'+(nests.length+1),
          dimension:profile.name,quality:'AH32',length:rawLength,usedLength:gap,parts:[]};
        nests.push(nest);
      }
      nest.parts.push({id:part.id,no:part.name,length:part.length,quality:part.quality,quantity:1,
        distanceInProfile:nest.usedLength,macroNum:0,workingLocation:part.workingLocation});
      nest.usedLength+=part.length+gap;
      nest.usedRatio=nest.usedLength/rawLength;
    }
    for(const nest of nests)nest.materialNum=nests.length;
    const usedRatio=nests.length?nests.reduce((sum,nest)=>sum+nest.usedRatio,0)/nests.length:0;
    return {batchNo,usedRatio,config:{edgeDistance:gap,partClearance:gap,minRestLength:100},
      dimensionQualityGroups:[{id:'group-1',dimension:profile.name,quality:'AH32',usedRatio,nests,restParts:[],restMaterials:[]}]};
  }
  window.webcamPreview={requests,updateNest,get filterOptions(){return filterOptions()}, expandedPartKeys:['root','H1234','H1234-1区-345','H1234-1区-345-CPX','H1234-1区-345-CPZ'], selectedParts:()=>structuredClone(initialParts.map(availablePart)),
  async importNestFiles(formData) {
    const {importNest}=await import('./assets/nest-resource-import.js');
    const summary={imported:0,drawn:0,failed:0,invalid:[]};
    for(const file of formData.values()){
      try {
        const rows=await importNest(file);
        const updateTime=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',dateStyle:'short',timeStyle:'medium'}).format(new Date());
        for(const row of rows){
          row.updateTime=updateTime;
          const index=resourceRows.findIndex(existing=>existing.id===row.id);
          if(index===-1) resourceRows.push(row);
          else {
            row.replacedOnImport=true;
            row.replacementVersion=crypto.randomUUID();
            const previousParts=new Set(resourceRows[index].nestDto.parts.map(part=>part.serialNo).filter(Boolean));
            for(const part of row.nestDto.parts){
              part.replacedOnImport=previousParts.has(part.serialNo);
              part.replacementVersion=row.replacementVersion;
            }
            resourceRows[index]=row;
          }
        }
        summary.imported++;
        if(rows[0].nestDto.drawingError) summary.failed++;
        else summary.drawn++;
        const {path}=resourceGroup(rows[0]);
        const [ship,type,code]=path.split(':');
        summary.selected ??= {id:rows[0].id,paths:[ship,[ship,type,code].join(':'),path]};
      } catch(error) {
        summary.invalid.push(file.name+'：'+error.message);
      }
    }
    return summary;
  },request(base,req){
    const endpoint=(new URL(base).pathname+'/'+(req.url||'').replace(/^\//,'')).replace(/^\/web-cam(?:\/api)?/,'');
    requests.push(endpoint);
    let data;
    if(endpoint==='/customNest/oneDimensionalNest'||endpoint==='/customNest/oneDimensionalNestV2'){
      const counts=new Map((req.data?.pieces??[]).map(p=>[p.id,p.count??1]));
      for(const [id,count] of counts){
        const part=parts.find(item=>item.id===id);
        if(!part||!Number.isInteger(count)||count<1||count>part.quantity-part.nestedNum){
          return Promise.resolve({code:1,data:null,message:'零件数量超出剩余可套量'});
        }
      }
      const next=parts.flatMap(part=>Array.from({length:counts.get(part.id)??0},(_,i)=>i?{...part,id:part.id+'-'+(i+1)}:part));
      const groupField=req.data?.groupMode==='area'?'areaCode':'blockNo';
      const first=next[0];
      if(!first||next.some(part=>part.shipNo!==first.shipNo||part[groupField]!==first[groupField])){
        return Promise.resolve({code:1,data:null,message:'所选零件不属于同一套料范围'});
      }
      selected=next;
      batchNo=first.shipNo+'-'+first[groupField]+'-00001';
      data=1;
    } else if(endpoint==='/nestLib/catalogTree') {
      data=resourceTree(req.data??{});
    } else if(endpoint==='/nestLib/list') {
      const {shipNo,blockNo,serialNo,searchWords,dimensions,previewFlowPath}=req.data??{};
      const profileNames=[profile,unfoldedProfile].filter(item=>dimensions?.includes(item.id)).map(item=>item.name);
      data=resourceRows.filter(row=>(!shipNo||row.nestDto.shipNo===shipNo)&&(!blockNo||row.nestDto.blockNo===blockNo)&&(!serialNo||row.serialNo===serialNo)&&
        (previewFlowPath!==undefined ? resourceGroup(row).path===previewFlowPath : !profileNames.length||profileNames.includes(row.nestDto.profile.dimension))&&matchesResource(row,searchWords));
    } else if(endpoint==='/nestLib/getNestDetails') {
      data=resourceDetails(req.params?.nestId);
    } else if(endpoint==='/nestLib/remove') {
      const ids=new Set(req.data?.ids??[]);
      resourceRows=resourceRows.filter(row=>!ids.has(row.id));
      data=null;
    } else if(endpoint==='/nestLib/listBySeqId2') {
      data=report();
    } else if(endpoint==='/pieceCatalog/rename'){
      const {id,areaCode}=req.data??{};
      const block=tree.flatMap(ship=>ship.children).find(item=>item.id===id);
      if(!block||typeof areaCode!=='string')return Promise.resolve({code:1,data:null,message:'无法修改该分段的区号'});
      block.areaCode=areaCode;
      for(const flow of block.children)for(const leaf of flow.children)leaf.areaCode=areaCode;
      for(const part of parts)if(part.blockId===id)part.areaCode=areaCode;
      data=null;
    } else if(endpoint==='/pieceCatalog/tree'){
      data=filterPartTree(tree,req.data??{});
    } else if(endpoint==='/piece/info'){
      const part=parts.find(part=>part.id===req.params?.id);
      data=part?{...part,macros:[]}:null;
    } else if(endpoint==='/piece/preNestPieceInfos'){
      const ids=req.data?.ids??[];
      data=parts.filter(part=>ids.includes(part.id)||ids.includes('node-'+part.id)).map(availablePart).filter(part=>part.remainingQuantity>0);
    } else if(Object.hasOwn(fixtures,endpoint)) data=fixtures[endpoint];
    else return Promise.resolve({code:1,data:null,message:'展示模式 · 此操作没有演示数据'});
    return Promise.resolve({code:0,message:'success',data:structuredClone(data)});
  }};
})();
