import {Component,useLayoutEffect,useRef,useState,type ButtonHTMLAttributes,type ReactNode} from 'react';
import {errorText,useSession} from '../api/client';
// Third-party/sanitizing renderers own only the children of this otherwise empty leaf.
export function DomLeaf({create,className}:{create:()=>HTMLElement;className?:string}){
 const ref=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{const element=create();ref.current?.replaceChildren(element);return()=>{element.remove();};},[create]);
 return <div ref={ref} className={className}/>;
}
export function Action({onAction,children,...props}:Omit<ButtonHTMLAttributes<HTMLButtonElement>,'onClick'>&{onAction:()=>unknown|Promise<unknown>;children:ReactNode}){
 const {notice}=useSession(),lock=useRef(false),[busy,setBusy]=useState(false);
 return <button type="button" {...props} disabled={props.disabled||busy} onClick={async()=>{if(lock.current)return;lock.current=true;setBusy(true);try{await onAction();}catch(e){notice(errorText(e));}finally{lock.current=false;setBusy(false);}}}>{children}</button>;
}
export class ErrorBoundary extends Component<{children:ReactNode},{failed:boolean}>{
 state={failed:false};static getDerivedStateFromError(){return{failed:true};}
 render(){return this.state.failed?<main><p role="alert">화면을 표시하지 못했습니다. 새로고침 후 다시 시도해 주세요.</p><button onClick={()=>location.reload()}>새로고침</button></main>:this.props.children;}
}
