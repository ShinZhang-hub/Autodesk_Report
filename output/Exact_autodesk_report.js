// Standalone JS for Autodesk team report.
// Requires global ALL_DATA (date -> team data) and DATES (array of date strings)
// defined by the HTML before this script loads.

var COLUMNS = [
  {key:'name', label:'Name', type:'text'},
  {key:'email', label:'Email', type:'text'},
  {key:'teamAlias', label:'Team', type:'text'},
  {key:'userActivity', label:'Status', type:'text'},
  {key:'daysInactive', label:'Days Inactive', type:'number'},
  {key:'daysUsed', label:'Days Used', type:'number'},
  {key:'monthlyAverage', label:'Monthly Avg', type:'number'},
  {key:'lastAccessed', label:'Last Access', type:'date'},
  {key:'assignDate', label:'Assign Date', type:'date'},
  {key:'product', label:'Product', type:'text'},
];
var data = [];
var REPORT_DATE = '';

function getVal(row,col){
  var v=row[col.key];
  if(col.type==='number') return parseFloat(v)||0;
  if(col.type==='date') return v||'';
  return v;
}

function getAdjAvg(row){
  if(!row.assignDate||!REPORT_DATE) return parseFloat(row.monthlyAverage)||0;
  var ad=new Date(row.assignDate);
  var ed=new Date(REPORT_DATE);
  var months=(ed-ad)/(1000*60*60*24*30);
  if(months<3&&months>0) return (parseFloat(row.daysUsed)||0)/months;
  return parseFloat(row.monthlyAverage)||0;
}

function compare(a,b,col,dir){
  var va=getVal(a,col), vb=getVal(b,col);
  if(col.type==='number') return dir*(va-vb);
  if(col.type==='date'){
    if(!va&&!vb) return 0;
    if(!va) return 1;
    if(!vb) return -1;
    return dir*(new Date(va)-new Date(vb));
  }
  va=String(va).toLowerCase(); vb=String(vb).toLowerCase();
  if(va<vb) return -dir;
  if(va>vb) return dir;
  return 0;
}

function getFlagInfo(row){
  var maxAvg=parseFloat(document.getElementById('flagMaxAvg').value)||7;
  var minDays=parseFloat(document.getElementById('flagMinDays').value)||7;
  var avg=getAdjAvg(row);
  var last=row.lastAccessed;
  var avgFlag=avg<maxAvg;
  var daysFlag=last?((new Date()-new Date(last))/86400000)>minDays:false;
  var mode=document.getElementById('flagMode').value;
  return {avgFlag:avgFlag, daysFlag:daysFlag, flagged:mode==='AND'?(avgFlag&&daysFlag):(avgFlag||daysFlag)};
}

function updateFlagged(){
  var flagged=[];
  for(var fi=0;fi<data.length;fi++){
    var info=getFlagInfo(data[fi]);
    if(info.flagged) flagged.push({row:data[fi], info:info});
  }
  var list=document.getElementById('flaggedList');
  if(flagged.length===0){
    list.innerHTML='<span style="color:#92400e">No users match the current thresholds.</span>';
  }else{
    var activeItems=[], inactiveItems=[];
    for(var fi=0;fi<flagged.length;fi++){
      var r=flagged[fi].row, info=flagged[fi].info;
      var emailId=r.email.split('@')[0];
      var dotCls=info.avgFlag&&info.daysFlag?'flag-dot-both':(info.avgFlag?'flag-dot-avg':'flag-dot-days');
      if(r.userActivity.toLowerCase()==='active'){
        activeItems.push({emailId:emailId, dotCls:dotCls});
      }else{
        inactiveItems.push({emailId:emailId, dotCls:dotCls});
      }
    }
    var maxRows=Math.max(activeItems.length,inactiveItems.length);
    var html='<div class="highlight-count" style="margin-bottom:10px">'+flagged.length+' user(s) flagged:</div><div class="flagged-grid">';
    html+='<div style="font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.3px;margin-bottom:10px;grid-column:1/3">Active</div>';
    html+='<div style="font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.3px;margin-bottom:10px;grid-column:3/5">Inactive</div>';
    for(var ri=0;ri<maxRows;ri++){
      if(ri<activeItems.length){
        var a=activeItems[ri];
        html+='<div class="flagged-item"><span class="flag-dot '+a.dotCls+'" style="--dot-col:1"></span><span class="flag-id" style="--id-col:2">'+esc(a.emailId)+'</span></div>';
      }else{
        html+='<div class="flagged-item"></div>';
      }
      if(ri<inactiveItems.length){
        var b=inactiveItems[ri];
        html+='<div class="flagged-item"><span class="flag-dot '+b.dotCls+'" style="--dot-col:3"></span><span class="flag-id" style="--id-col:4">'+esc(b.emailId)+'</span></div>';
      }else{
        html+='<div class="flagged-item"></div>';
      }
    }
    html+='</div>';
    list.innerHTML=html;
  }
  applyFiltersAndSort();
}

function toggleDetails(){
  var toggle=document.getElementById('detailToggle');
  var content=document.getElementById('detailContent');
  var collapsed=toggle.classList.toggle('collapsed');
  content.classList.toggle('collapsed');
  if(!collapsed) applyFiltersAndSort();
}

var sortCol=null, sortDir=1, showFlagged=false;

function applyFiltersAndSort(){
  var filters=[];
  COLUMNS.forEach(function(col,ci){
    var el=document.getElementById('f_'+ci);
    if(!el) return;
    if(col.type==='text'){
      var v=el.value;
      if(v){
        filters.push({col:col, test:function(r){return String(getVal(r,col)).toLowerCase()===v.toLowerCase();}});
      }
    }else if(col.type==='number'){
      var opEl=document.getElementById('fop_'+ci);
      var numEl=el;
      var op=opEl?opEl.value:'';
      var num=parseFloat(numEl.value);
      if(op&&!isNaN(num)){
        filters.push({col:col, test:function(r){
          var val=getVal(r,col);
          if(op==='>=') return val>=num;
          if(op==='<=') return val<=num;
          if(op==='>') return val>num;
          if(op==='<') return val<num;
          if(op==='=') return val===num;
          return true;
        }});
      }
    }else if(col.type==='date'){
      var modeEl=document.getElementById('fdm_'+ci);
      var dateEl=el;
      var mode=modeEl?modeEl.value:'';
      var dateVal=dateEl.value;
      if(mode&&dateVal){
        var cmp=new Date(dateVal).getTime();
        filters.push({col:col, test:function(r){
          var d=getVal(r,col);
          if(!d) return false;
          var t=new Date(d).getTime();
          if(mode==='before') return t<=cmp+86400000;
          if(mode==='after') return t>=cmp;
          return true;
        }});
      }
    }
  });
  if(showFlagged){
    var flagInfoMap={};
    for(var fi=0;fi<data.length;fi++){
      var info=getFlagInfo(data[fi]);
      if(info.flagged) flagInfoMap[data[fi]._idx]=true;
    }
    filters.push({col:null, test:function(r){return !!flagInfoMap[r._idx];}});
  }
  var filtered=data.filter(function(r){return filters.every(function(f){return f.test(r);});});
  if(sortCol!==null){
    var col=COLUMNS[sortCol];
    filtered.sort(function(a,b){return compare(a,b,col,sortDir);});
  }
  render(filtered);
  var visible=document.getElementById('detailContent').classList.contains('collapsed');
  if(!visible) document.getElementById('recCount').innerHTML='Showing <strong>'+filtered.length+'</strong> records';
}

function render(rows){
  var tbody=document.getElementById('tableBody');
  var flagInfoMap={};
  for(var fi=0;fi<data.length;fi++){
    var info=getFlagInfo(data[fi]);
    if(info.flagged) flagInfoMap[data[fi]._idx]=info;
  }
  var html='';
  var endDate=REPORT_DATE?new Date(REPORT_DATE):new Date();
  for(var ri=0;ri<rows.length;ri++){
    var r=rows[ri];
    var act=r.userActivity.toLowerCase()==='active'?'Active':'Inactive';
    var ab=act==='Active'?'<span class="badge badge-active">Active</span>':'<span class="badge badge-inactive">Inactive</span>';
    var info=flagInfoMap[r._idx];
    var rowCls=info&&!showFlagged?' class="flagged-row"':'';
    var avgCell=esc(r.monthlyAverage||'0');
    var daysCell=esc(r.lastAccessed||'-');
    var assignCell=esc((r.assignDate||'').split('T')[0]||'-');
    if(r.assignDate){
      var ad=new Date(r.assignDate);
      var months=(endDate-ad)/(1000*60*60*24*30);
      if(months<3&&months>0){
        var recalcAvg=getAdjAvg(r);
        avgCell=esc(recalcAvg.toFixed(1))+' ('+esc(r.monthlyAverage||'0')+') <span class="info-icon" onclick="scrollToNote()" style="cursor:pointer">i</span>';
        assignCell='<span class="cell-assign-recalc">'+esc((r.assignDate||'').split('T')[0])+'</span>';
      }
    }
    if(showFlagged&&info){
      if(info.avgFlag) avgCell='<span class="cell-highlight-avg">'+avgCell+'</span>';
      if(info.daysFlag) daysCell='<span class="cell-highlight-days">'+daysCell+'</span>';
    }
    html+='<tr'+rowCls+'><td>'+esc(r.name)+'</td><td>'+esc(r.email)+'</td><td>'+esc(r.teamAlias)+'</td><td>'+ab+'</td><td>'+esc(r.daysInactive||'-')+'</td><td>'+esc(r.daysUsed||'0')+'</td><td>'+avgCell+'</td><td>'+daysCell+'</td><td>'+assignCell+'</td><td>'+esc(r.product)+'</td></tr>';
  }
  tbody.innerHTML=html;
  var hasRecalc=false;
  for(var ri=0;ri<rows.length;ri++){
    var r=rows[ri];
    if(r.assignDate){
      var ad=new Date(r.assignDate);
      if((endDate-ad)/(1000*60*60*24*30)<3) hasRecalc=true;
    }
  }
  var note=document.getElementById('recalcNote');
  if(note) note.style.display=hasRecalc?'':'none';
}

function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}

function buildHeader(){
  var thead=document.getElementById('tableHead');
  var h='<tr>';
  COLUMNS.forEach(function(col,ci){
    var cls='';
    if(sortCol===ci) cls=sortDir>0?' sorted-asc':' sorted-desc';
    h+='<th class="'+cls+'" onclick="sortBy('+ci+')"><span>'+col.label+'</span><span class="sort-icon"> \u25b2\u25bc</span></th>';
  });
  h+='</tr><tr class="filter-row">';
  COLUMNS.forEach(function(col,ci){
    if(col.type==='text'){
      var vals={};
      for(var i=0;i<data.length;i++){
        var v=getVal(data[i],col);
        if(v) vals[v]=true;
      }
      var sorted=Object.keys(vals).sort();
      var opts='<option value="">All</option>';
      for(var i=0;i<sorted.length;i++){
        var sv=sorted[i];
        opts+='<option value="'+esc(sv)+'">'+esc(sv)+'</option>';
      }
      h+='<th><select id="f_'+ci+'" onchange="applyFiltersAndSort()">'+opts+'</select></th>';
    }else if(col.type==='number'){
      h+='<th><div class="cmp-row"><select id="fop_'+ci+'" onchange="applyFiltersAndSort()"><option value="">-</option><option value=">=">\u2265</option><option value="<=">\u2264</option><option value=">">&gt;</option><option value="<">&lt;</option><option value="=">=</option></select><input id="f_'+ci+'" type="number" oninput="applyFiltersAndSort()" placeholder="value"></div></th>';
    }else if(col.type==='date'){
      h+='<th><div class="date-row"><select id="fdm_'+ci+'" onchange="applyFiltersAndSort()"><option value="">-</option><option value="before">before</option><option value="after">after</option></select><input id="f_'+ci+'" type="text" placeholder="YYYY-MM-DD" oninput="applyFiltersAndSort()"></div></th>';
    }
  });
  h+='</tr>';
  thead.innerHTML=h;
}

function showFlaggedOnly(){
  showFlagged=true;
  sortCol=null; sortDir=1;
  clearFilterInputs();
  applyFiltersAndSort();
}

function clearFilterInputs(){
  COLUMNS.forEach(function(col,ci){
    var el=document.getElementById('f_'+ci);
    if(el){
      if(el.tagName==='SELECT') el.selectedIndex=0;
      else el.value='';
    }
    var opEl=document.getElementById('fop_'+ci);
    if(opEl) opEl.selectedIndex=0;
    var dmEl=document.getElementById('fdm_'+ci);
    if(dmEl) dmEl.selectedIndex=0;
  });
  var ths=document.querySelectorAll('#tableHead th');
  for(var i=0;i<ths.length;i++) ths[i].className='';
}

function clearFilters(){
  showFlagged=false;
  sortCol=null; sortDir=1;
  clearFilterInputs();
  applyFiltersAndSort();
}

function sortBy(ci){
  if(sortCol===ci) sortDir*=-1;
  else{sortCol=ci; sortDir=-1;}
  applyFiltersAndSort();
  var ths=document.querySelectorAll('#tableHead th');
  for(var i=0;i<ths.length;i++){
    ths[i].className=(i===ci?(sortDir>0?'sorted-asc':'sorted-desc'):'');
  }
}

function loadDate(dateStr){
  var json = ALL_DATA[dateStr];
  if(!json){ document.getElementById('summaryCards').innerHTML='<div class="summary-card"><div class="value" style="color:#dc2626">No data for '+dateStr+'</div></div>'; return; }
  var users = json.users;
  data = users.map(function(u,i){
    return {
      _idx:i,
      name:(u.firstName+' '+u.lastName).trim(),
      email:u.email,
      teamAlias:u.teamAlias,
      userActivity:u.userActivity,
      daysInactive:u.daysInactive||'0',
      daysUsed:u.daysUsed||'0',
      monthlyAverage:u.monthlyAverage||'0',
      lastAccessed:u.lastAccessed||'',
      assignDate:u.assignDate||'',
      product:u.product
    };
  });
  REPORT_DATE = dateStr;
  var productSet = {};
  var activeCount = 0;
  for(var i=0;i<users.length;i++){
    if(users[i].product) productSet[users[i].product]=true;
    if(users[i].userActivity.toLowerCase()==='active') activeCount++;
  }
  document.getElementById('summaryCards').innerHTML =
    '<div class="summary-card"><div class="label">Records</div><div class="value">'+json.totalRecords+'</div></div>' +
    '<div class="summary-card"><div class="label">Users</div><div class="value">'+json.uniqueUsers+'</div></div>' +
    '<div class="summary-card"><div class="label">Products</div><div class="value">'+Object.keys(productSet).length+'</div></div>' +
    '<div class="summary-card"><div class="label">Active</div><div class="value">'+activeCount+'</div></div>' +
    '<div class="summary-card"><div class="label">Inactive</div><div class="value">'+(json.uniqueUsers-activeCount)+'</div></div>';
  document.getElementById('recCount').innerHTML='Showing <strong>'+json.totalRecords+'</strong> records';
  buildHeader();
  updateFlagged();
}

function scrollToNote(){document.getElementById('recalcNote').scrollIntoView({behavior:'smooth'})}

loadDate(DATES[DATES.length-1]);
