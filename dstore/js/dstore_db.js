// Copyright (c) 2014 International Aid Transparency Initiative (IATI)
// Licensed under the MIT license whose full text can be found at http://opensource.org/licenses/MIT

module.exports=exports;

var dstore_db=exports;

var refry=require('./refry');
var exs=require('./exs');
var iati_xml=require('./iati_xml');
var iati_cook=require('./iati_cook');

var codes=require('../json/iati_codes');

var wait=require('wait.for');

var util=require('util');
var http=require('http');


var dstore_back=require('./dstore_back');
//dstore_back.dstore_db=dstore_db; // circular dependencies...


var ls=function(a) { console.log(util.inspect(a,{depth:null})); }

var tonumber=function(v)
{
	var n=Number(v);
	if(("number" == typeof n)&&(n==n)) // number and not nan
	{
		return n;
	}
	return undefined;
}


// values copied from the main activity into sub tables for quik lookup (no need to join tables)
dstore_db.bubble_act={
		"aid":true
	};
	
	
// data table descriptions
dstore_db.tables={
	jml:[
		{ name:"aid",							NOCASE:true , PRIMARY:true },
		{ name:"jml",							TEXT:true }, // moved to reduce the main act table size
	],
	act:[
		{ name:"aid",							NOCASE:true , PRIMARY:true },
		{ name:"reporting",						NOCASE:true , INDEX:true },
		{ name:"reporting_ref",					NOCASE:true , INDEX:true },
		{ name:"funder_ref",					NOCASE:true , INDEX:true },
		{ name:"title",							NOCASE:true },
		{ name:"slug",							NOCASE:true , INDEX:true },
		{ name:"status_code",					INTEGER:true , INDEX:true },	
		{ name:"day_start",						INTEGER:true , INDEX:true },	
		{ name:"day_end",						INTEGER:true , INDEX:true },
		{ name:"day_length",					INTEGER:true , INDEX:true },
		{ name:"description",					NOCASE:true },
		{ name:"commitment",					REAL:true , INDEX:true }, // USD (C)
		{ name:"spend",							REAL:true , INDEX:true },  // USD (D+E)
		{ name:"commitment_eur",				REAL:true , INDEX:true }, // EUR (C)
		{ name:"spend_eur",						REAL:true , INDEX:true },  // EUR (D+E)
		{ name:"commitment_gbp",				REAL:true , INDEX:true }, // GBP (C)
		{ name:"spend_gbp",						REAL:true , INDEX:true },  // GBP (D+E)
		{ name:"commitment_cad",				REAL:true , INDEX:true }, // CAD (C)
		{ name:"spend_cad",						REAL:true , INDEX:true },  // CAD (D+E)
		{ name:"flags",							INTEGER:true , INDEX:true },
// FLAGS set to 0 if good otherwise
// 1 == secondary publisher so transactions/budgets should be ignored to avoid double accounting
	],
	trans:[
		{ name:"aid",							NOCASE:true , INDEX:true },
		{ name:"trans_ref",						NOCASE:true , INDEX:true },
		{ name:"trans_description",				NOCASE:true , INDEX:true },
		{ name:"trans_day",						INTEGER:true , INDEX:true },
		{ name:"trans_currency",				NOCASE:true , INDEX:true },
		{ name:"trans_value",					REAL:true , INDEX:true },
		{ name:"trans_usd",						REAL:true , INDEX:true },
		{ name:"trans_eur",						REAL:true , INDEX:true },
		{ name:"trans_gbp",						REAL:true , INDEX:true },
		{ name:"trans_cad",						REAL:true , INDEX:true },
		{ name:"trans_code",					NOCASE:true , INDEX:true },
		{ name:"trans_flow_code",				NOCASE:true , INDEX:true },
		{ name:"trans_finance_code",			NOCASE:true , INDEX:true },
		{ name:"trans_aid_code",				NOCASE:true , INDEX:true },
		{ name:"trans_flags",					INTEGER:true , INDEX:true },
// FLAGS set to 0 if good otherwise
// 1 == this is a fake transaction built after a full import for publishers that only publish C not D/E
	],
	budget:[
		{ name:"aid",							NOCASE:true , INDEX:true },
		{ name:"budget",						NOCASE:true , INDEX:true }, // budget or plan (planned-disbursement) or total,country,org (organization total,country,org)
		{ name:"budget_priority",				INTEGER:true , INDEX:true }, // set to 0 if it should be ignored(bad data or total)
		{ name:"budget_type",					NOCASE:true , INDEX:true },	// planed disburtions have priority
		{ name:"budget_day_start",				INTEGER:true , INDEX:true },
		{ name:"budget_day_end",				INTEGER:true , INDEX:true },
		{ name:"budget_day_length",				INTEGER:true , INDEX:true }, // budgets longer than a year will have 0 priority
		{ name:"budget_currency",				NOCASE:true , INDEX:true },
		{ name:"budget_value",					REAL:true , INDEX:true },
		{ name:"budget_usd",					REAL:true , INDEX:true },
		{ name:"budget_eur",					REAL:true , INDEX:true },
		{ name:"budget_gbp",					REAL:true , INDEX:true },
		{ name:"budget_cad",					REAL:true , INDEX:true },
		{ name:"budget_country",				NOCASE:true , INDEX:true },	// only used by country budget from orgfile
		{ name:"budget_org",					NOCASE:true , INDEX:true },	// only used by org budget from orgfile
	],
	country:[
		{ name:"aid",							NOCASE:true , INDEX:true },
		{ name:"country_code",					NOCASE:true , INDEX:true },
		{ name:"country_percent",				REAL:true , INDEX:true },
	],
	sector:[
		{ name:"aid",							NOCASE:true , INDEX:true },
		{ name:"sector_group",					NOCASE:true , INDEX:true },	// sector group
		{ name:"sector_code",					INTEGER:true , INDEX:true },
		{ name:"sector_percent",				REAL:true , INDEX:true },
	],
	location:[
		{ name:"aid",							NOCASE:true , INDEX:true },
		{ name:"location_code",					NOCASE:true , INDEX:true },
		{ name:"location_gazetteer_ref",		NOCASE:true , INDEX:true },
		{ name:"location_gazetteer",			NOCASE:true , INDEX:true },
		{ name:"location_name",					NOCASE:true , INDEX:true },
		{ name:"location_longitude",			REAL:true , INDEX:true },
		{ name:"location_latitude",				REAL:true , INDEX:true },
		{ name:"location_precision",			INTEGER:true , INDEX:true },
		{ name:"location_percent",				REAL:true , INDEX:true },
	],
// track what was imported...
	slug:[
		{ name:"aid",							NOCASE:true , INDEX:true },
		{ name:"slug",							NOCASE:true , INDEX:true },
	]
};
	
var http_getbody=function(url,cb)
{
	http.get(url, function(res) {
		res.setEncoding('utf8');
		var s="";
		res.on('data', function (chunk) {
			s=s+chunk;
		});
		res.on('end', function() {
			cb(null,s);
		});
	}).on('error', function(e) {
		cb(e,null);
	});

};


dstore_db.open = function(){
	return dstore_back.open();
};



// pull every activity from the table and update *all* connected tables using its raw xml data

dstore_db.refresh_budget=function(db,it,act,act_json,priority)
{
	
	var t={};
	for(var n in dstore_db.bubble_act){ t[n]=act_json[n]; } // copy some stuff

	t.budget_priority=priority;
	
	t.budget="unknown";
	if(it[0]=="planned-disbursement") // flag to share table with planned-disbursement (they seem very similar)
	{
		t.budget="plan";
	}
	else
	if(it[0]=="budget")
	{
		t.budget="budget";
	}
	else
	if(it[0]=="total-budget")
	{
		t.budget="total";
		t.budget_priority=0; // make sure this does not double count
	}
	else
	if(it[0]=="recipient-org-budget")
	{
		t.budget="org";
		t.budget_priority=0; // make sure this does not double count
	}
	else
	if(it[0]=="recipient-country-budget")
	{
		t.budget="country";
		t.budget_priority=0; // make sure this does not double count
	}
	
	t["budget_type"]=it["type"];

	t["budget_day_start"]=				iati_xml.get_isodate_number(it,"period-start");
	t["budget_day_end"]=				iati_xml.get_isodate_number(it,"period-end");


	t["budget_day_length"]=null;
	if(t["budget_day_end"] && t["budget_day_start"] ) // length may be null for bad data
	{
		t["budget_day_length"]=			t["budget_day_end"]-t["budget_day_start"];
		if( t["budget_day_length"] < 0 )
		{
			t["budget_day_length"]=null; // ends before it starts
		}
	}
	
	if( (!t["budget_day_length"]) || (t["budget_day_length"] > 370) ) // allow a few days over a year
	{
		t.budget_priority=0; // remove priority
	}
	
	t["budget_currency"]=				iati_xml.get_value_currency(it,"value");
	t["budget_value"]=					iati_xml.get_value(it,"value");
	t["budget_usd"]=					iati_xml.get_ex(it,"value","USD");
	t["budget_eur"]=					iati_xml.get_ex(it,"value","EUR");
	t["budget_gbp"]=					iati_xml.get_ex(it,"value","GBP");
	t["budget_cad"]=					iati_xml.get_ex(it,"value","CAD");

	t["budget_country"]=				refry.tagattr(it,"recipient-country","code");
	t["budget_org"]=					refry.tagattr(it,"recipient-org","ref");
	
	if( t["budget_country"] )
	{
		t["budget_country"] = t["budget_country"].trim().toUpperCase();
 	}


	t.jml=JSON.stringify(it);
	
	dstore_back.replace(db,"budget",t);
};


dstore_db.refresh_act = function(db,aid,xml,head){

// choose to prioritise planned-transaction or budgets for each year depending on which we fine in the xml
// flag each year when present
	var got_budget={};

	var replace=function(name,it)
	{
		dstore_back.replace(db,name,it);
	}

	var refresh_transaction=function(it,act,act_json)
	{
//		process.stdout.write("t");

		var t={};
		for(var n in dstore_db.bubble_act){ t[n]=act_json[n]; } // copy some stuff

		t["trans_ref"]=				it["ref"];
		t["trans_description"]=		refry.tagval_narrative(it,"description");
		t["trans_day"]=				iati_xml.get_isodate_number(it,"transaction-date");

		t["trans_code"]=			iati_xml.get_code(it,"transaction-type");
		t["trans_flow_code"]=		iati_xml.get_code(it,"flow-type");
		t["trans_finance_code"]=	iati_xml.get_code(it,"finance-type");
		t["trans_aid_code"]=		iati_xml.get_code(it,"aid-type");

		
		t["trans_currency"]=		iati_xml.get_value_currency(it,"value");
		t["trans_value"]=			iati_xml.get_value(it,"value");
		t["trans_usd"]=				iati_xml.get_ex(it,"value","USD");
		t["trans_eur"]=				iati_xml.get_ex(it,"value","EUR");
		t["trans_gbp"]=				iati_xml.get_ex(it,"value","GBP");
		t["trans_cad"]=				iati_xml.get_ex(it,"value","CAD");

// map new 201 codes to old		
		t["trans_code"]= codes.transaction_type_map[ t["trans_code"] ] || t["trans_code"];

// transaction flag, 0 by default
		t["trans_flags"]=			0;

		t.jml=JSON.stringify(it);
		
		dstore_back.replace(db,"trans",t);
	};

	var refresh_budget=function(it,act,act_json,priority)
	{
		dstore_db.refresh_budget(db,it,act,act_json,priority);
		
		var y=iati_xml.get_isodate_year(it,"period-start"); // get year from start date
		got_budget[ y ]=true;
	};

	var refresh_activity=function(xml,head)
	{
//		process.stdout.write("a");
		
		var act=xml;
		if((typeof xml)=="string") { act=refry.xml(xml,aid); } // raw xml convert to jml
		act=refry.tag(act,"iati-activity"); // and get the main tag
		
		if(head) // copy all attributes from iati-activities into each activity unless the activity already has it
		{
			for(var n in head) { act[n]=act[n] || head[n]; }
		}
		
		iati_cook.activity(act); // cook the raw json(xml) ( most cleanup logic has been moved here )
	
		var t={};
		
		t.slug=refry.tagattr(act,"iati-activity","dstore:slug"); // this value is hacked in when the acts are split
		t.aid=iati_xml.get_aid(act);

		if(!t.aid) // do not save when there is no ID
		{
			return;
		}

// report if this id is from another file and being replaced, possibly from this file even
// I think we should complain a lot about this during import
		dstore_db.warn_dupes(db,t.aid);

// make really really sure old junk is deleted
		(["act","jml","trans","budget","country","sector","location","slug"]).forEach(function(v,i,a){
			dstore_db.delete_from(db,v,{aid:t.aid});
		});


		t.title=refry.tagval_narrative(act,"title");
		t.description=refry.tagval_narrative(act,"description");				
		t.reporting=refry.tagval(act,"reporting-org");				
		t.reporting_ref=refry.tagattr(act,"reporting-org","ref");
		t.status_code=refry.tagattr(act,"activity-status","code");

		t.flags=0;
		if( codes.publisher_secondary[t.reporting_ref] ) { t.flags=1; } // flag as secondary publisher (probably best to ignore)

		t.commitment=0;
		t.spend=0;
		t.commitment_eur=0;
		t.spend_eur=0;
		t.commitment_gbp=0;
		t.spend_gbp=0;
		t.commitment_cad=0;
		t.spend_cad=0;

		refry.tags(act,"transaction",function(it){
			var code=iati_xml.get_code(it,"transaction-type");
			code= codes.transaction_type_map[code] || code ; // map new 201 codes to old letters

			code=code && (code.toUpperCase());
			if(code=="C")
			{
				var usd=iati_xml.get_ex(it,"value","USD");	t.commitment+=usd;
				var eur=iati_xml.get_ex(it,"value","EUR");	t.commitment_eur+=eur;
				var gbp=iati_xml.get_ex(it,"value","GBP");	t.commitment_gbp+=gbp;
				var cad=iati_xml.get_ex(it,"value","CAD");	t.commitment_cad+=cad;
			}
			if( (code=="D") || (code=="E") )
			{
				var usd=iati_xml.get_ex(it,"value","USD");	t.spend+=usd;
				var eur=iati_xml.get_ex(it,"value","EUR");	t.spend_eur+=eur;
				var gbp=iati_xml.get_ex(it,"value","GBP");	t.spend_gbp+=gbp;
				var cad=iati_xml.get_ex(it,"value","CAD");	t.spend_cad+=cad;
			}
		});
//console.log("C="+t.commitment+"\tD+E="+t.spend);

		var funder;
		
		if(!funder) { funder=refry.tagattr(act,{0:"participating-org",role:"funding"},"ref"); }
		if(funder){ funder=funder.trim(); if(!codes.funder_names[funder]) {funder=null;} } //validate code
		
		if(!funder) { funder=refry.tagattr(act,{0:"participating-org",role:"extending"},"ref"); }
		if(funder){ funder=funder.trim(); if(!codes.funder_names[funder]) {funder=null;} } //validate code
		
		if(!funder) { funder=refry.tagattr(act,{0:"reporting-org"},"ref"); }
		if(funder)
		{
			funder=funder.trim();
			funder=codes["iati_funders"][funder] || funder; // special group and or rename
		}
		t.funder_ref=funder; // remember funder id


// fix percents to add upto 100
		var fixpercents=function(aa)
		{
			var total=0;
			
			for(var i=0;i<aa.length;i++)
			{
				aa[i]=parseFloat(aa[i]) || 1;
				if(aa[i]<1) { aa[i]=-aa[i]; } // fix negative percents?
				total+=aa[i];
			}

			for(var i=0;i<aa.length;i++)
			{
				aa[i]=100*aa[i]/total;
			}			
		};
		
		var country=[];
		var percents=[];
		refry.tags(act,"recipient-country",function(it){ country.push( (it.code || "").trim().toUpperCase() ); percents.push(it.percentage); });
		fixpercents(percents);
		if(country[0]) {
			for( var i=0; i<country.length ; i++ )
			{
				var cc=country[i];
				var pc=percents[i];
				dstore_back.replace(db,"country",{"aid":t.aid,"country_code":cc,"country_percent":pc});
			}
		}

		var sectors=[];
		var percents=[];
		refry.tags(act,"sector",function(it){ if(it.vocabulary=="DAC" || it.vocabulary=="1" || it.vocabulary=="2") { sectors.push(it.code); percents.push(it.percentage); } });
		fixpercents(percents);
		if(sectors[0]) {
			for( var i=0; i<sectors.length ; i++ )
			{
				var sc=sectors[i];
				var pc=percents[i];
				var group;
				if(sc){ group=codes.sector_group[sc.slice(0,3)]; }
				sc=tonumber(sc) || 0;
				dstore_back.replace(db,"sector",{"aid":t.aid,"sector_group":group,"sector_code":sc,"sector_percent":pc});
			}
		}

		var locations=[];
		var percents=[];
		refry.tags(act,"location",function(it){ locations.push(it); percents.push(it.percentage); });
		fixpercents(percents);
		if(locations[0]) {
			for( var i=0; i<locations.length ; i++ )
			{
				var it=locations[i];
				var pc=percents[i];
				var longitude;
				var latitude;
				var precision;
				var name=refry.tagval_narrative(it,"name");
				var code=refry.tagattr(it,"location-type","code");
				var gazref=refry.tagattr(it,"gazetteer-entry","gazetteer-ref");
				var gaz=refry.tagval_narrative(it,"gazetteer-entry");
				var co=refry.tag(it,"coordinates");
				if(co)
				{
					longitude=tonumber(co.longitude);
					latitude=tonumber(co.latitude);
					precision=tonumber(co.precision);
				}
				var point=refry.tag(it,"point");
				var exact=refry.tag(it,"exactness");
				if(point) // new style point/pos
				{
					var pos=refry.tagval_trim(point,"pos");
					if(pos)
					{
						var aa=pos.match(/\S+/g);
						if(aa)
						{
							latitude=tonumber(aa[0]);
							longitude=tonumber(aa[1]);
							if( exact && exact.code )
							{
								precision=exact.code;
							}
						}
					}
				}

				dstore_back.replace(db,"location",{
					"aid":t.aid,
					"location_code":code,
					"location_gazetteer_ref":gazref,
					"location_gazetteer":gaz,
					"location_name":name,
					"location_longitude":longitude,
					"location_latitude":latitude,
					"location_precision":precision,
					"location_percent":pc
				});
			}
		}

// also accept 201 number codes
		t.day_start=null;
		t.day_end=null;
		refry.tags(act,"activity-date",function(it){
			if( it.type=="start-planned" || it.type=="1" ) 	{ t.day_start=iati_xml.get_isodate_number(it); }
			else
			if( it.type=="end-planned"   || it.type=="3" )	{ t.day_end=iati_xml.get_isodate_number(it); }
		});
		refry.tags(act,"activity-date",function(it){
			if( it.type=="start-actual"  || it.type=="2" ) 	{ t.day_start=iati_xml.get_isodate_number(it); }
			else
			if( it.type=="end-actual"    || it.type=="4" )	{ t.day_end=iati_xml.get_isodate_number(it); }
		});

		t.day_length=null;
		if( t["day_start"] ) // length may be null for bad data
		{
			if(t["day_end"]) // allow missing end date
			{
				t["day_length"]=			t["day_end"]-t["day_start"];
				if( t["day_length"] < 0 )
				{
					t["day_length"]=null; // ends before it starts
				}
			}
			else // allow missing end date (null), just set length to 0 rather than null so it is not discarded
			{
				t.day_length=0
			}
		}
		
		
		
//		t.xml=xml;
		t.jml=JSON.stringify(act);
		
//		dstore_back.replace(db,"activity",t);
		replace("act",t);
		replace("jml",t);
		
		got_budget={}; // reset
		refry.tags(act,"transaction",function(it){refresh_transaction(it,act,t);});
		refry.tags(act,"budget",function(it){refresh_budget(it,act,t,1);});
		refry.tags(act,"planned-disbursement",function(it){
			var y=iati_xml.get_isodate_year(it,"period-start"); // get year from start date
			if( (!y) || (!got_budget[y]) ) // if not already filled in (budget is missing or has bad data)
			{
				refresh_budget(it,act,t,1); // then try and use this planned-disbursement instead
			}
			else
			{
				refresh_budget(it,act,t,0); // else this is marked as data to ignore (priority of 0)
//				ls({"skipyear":y});
			}
		});
		
//update slug

		dstore_back.replace(db,"slug",{"aid":t.aid,"slug":t.slug});
		
		return t;
	};
	
	// then add new
	refresh_activity(xml,head);

};



dstore_db.vacuum = function(){
	var f=dstore_back.vacuum;
	if(f) { return f(); }
};

dstore_db.analyze = function(){
	var f=dstore_back.analyze;
	if(f) { return f(); }
};

dstore_db.fill_acts = function(acts,slug,data,head,main_cb){
	var f=dstore_back.fill_acts;
	if(f) { return f(acts,slug,data,head,main_cb); }
};

dstore_db.fake_trans = function(){
	var f=dstore_back.fake_trans;
	if(f) { return f(); }
};

dstore_db.warn_dupes = function(db,aid){
	var f=dstore_back.warn_dupes;
	if(f) { return f(db,aid); }
};



dstore_db.create_tables = function(){
	return dstore_back.create_tables();
}

dstore_db.create_indexes = function(){
	return dstore_back.create_indexes();
}

dstore_db.delete_indexes = function(){
	return dstore_back.delete_indexes();
}

dstore_db.check_tables = function(){
	return dstore_back.check_tables();
}

// handle a simple delete
dstore_db.delete_from = function(db,tablename,opts){
	return dstore_back.delete_from(db,tablename,opts);
}

// prepare some sql code
dstore_db.cache_prepare = function(){
	return dstore_back.cache_prepare(dstore_db.tables);
}

// the database part of the query code
dstore_db.query_select=function(q,res,r){
	return dstore_back.query_select(q,res,r);
}

dstore_db.cache_prepare();

